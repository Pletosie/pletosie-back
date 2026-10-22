import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Audit,
  Product,
  Order,
  OrderLine,
  Conversation,
  Message,
  User,
  AnalyticsEvent,
  Offer,
  Refund,
  Notification,
  ProductionCapacity,
  Cart,
  Setting,
} from './entities';
import { CheckoutDto, MessageDto, ProductDto } from './dto';
import { seed } from './seed';
import { AudioService } from './audio.service';
@Injectable()
export class ShopService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly db: DataSource,
    readonly audio: AudioService,
  ) {}
  async onModuleInit() {
    await seed(this.db);
    await this.expire();
    this.timer = setInterval(() => {
      void this.expire().catch(() =>
        console.error('Expiration des réservations à relancer'),
      );
    }, 30000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.db.transaction('SERIALIZABLE', work);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (attempt >= 3 || !['40001', '40P01'].includes(code || '')) throw e;
        }
      }
    };
    if (this.db.options.type === 'postgres') return run();
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  async audit(
    em: EntityManager,
    actor: string,
    action: string,
    reference: string,
    reason: string,
  ) {
    await em.save(Audit, {
      id: randomUUID(),
      actor,
      action,
      reference,
      reason,
    });
  }
  async products(admin = false) {
    return this.db
      .getRepository(Product)
      .find({
        where: admin ? {} : { published: true },
        order: { createdAt: 'DESC' },
        take: 200,
      });
  }
  async product(id: string) {
    const p = await this.db.getRepository(Product).findOneBy({ id });
    if (!p) throw new NotFoundException('Article introuvable.');
    return p;
  }
  async saveProduct(id: string | null, dto: ProductDto, user: User) {
    if (!/^[a-z0-9-]+$/.test(dto.slug))
      throw new BadRequestException(
        'La référence URL doit contenir uniquement lettres minuscules, chiffres et tirets.',
      );
    const keys = dto.variants.map((v) => `${v.color}/${v.size}`);
    if (
      new Set(keys).size !== keys.length ||
      new Set(dto.variants.map((v) => v.id)).size !== keys.length
    )
      throw new BadRequestException(
        'Chaque variante et combinaison doivent être uniques.',
      );
    for (const image of [dto.image, ...dto.variants.map((v) => v.image)])
      if (
        !/^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(image) &&
        !/^https:\/\/res\.cloudinary\.com\//.test(image)
      )
        throw new BadRequestException('Utilisez un média local ou Cloudinary.');
    const { reason, ...data } = dto;
    return this.transaction(async (em) => {
      if (id) {
        const old = await em.findOneBy(Product, { id });
        if (!old) throw new NotFoundException();
        const pending = await em.find(Order, { where: { released: false } });
        if (
          pending.some(
            (o) =>
              !['delivered', 'cancelled'].includes(o.status) &&
              o.items.some((i) => i.productId === id),
          )
        )
          throw new ConflictException(
            'Cet article figure dans une commande active. Terminez ou annulez la commande avant de modifier son stock.',
          );
      }
      const p = await em.save(Product, { ...data, id: id || randomUUID() });
      await this.audit(em, user.id, 'product.save', p.id, reason);
      return p;
    });
  }
  async zones() {
    const stored = await this.db
      .getRepository(Setting)
      .findOneBy({ id: 'delivery_zones' });
    if (stored)
      return stored.value as { id: string; name: string; fee: number }[];
    try {
      return JSON.parse(process.env.DELIVERY_ZONES || '[]') as {
        id: string;
        name: string;
        fee: number;
      }[];
    } catch {
      return [];
    }
  }
  async checkout(dto: CheckoutDto, user: User) {
    if (!dto.accepted)
      throw new BadRequestException(
        'Acceptez les conditions avant de continuer.',
      );
    if (process.env.COMMERCE_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Les ventes ne sont pas encore ouvertes : livraison, conditions et paiement doivent être validés par l’atelier. Votre panier est conservé.',
      );
    const zone = (await this.zones()).find((z) => z.id === dto.address.zone);
    if (!zone || !Number.isSafeInteger(zone.fee) || zone.fee < 0)
      throw new BadRequestException('Zone non desservie.');
    return this.transaction(async (em) => {
      const existing = await em.findOneBy(Order, {
        userId: user.id,
        key: dto.key,
      });
      if (existing) return existing;
      const merged = new Map<
        string,
        { productId: string; variantId: string; quantity: number }
      >();
      for (const item of dto.items) {
        const key = `${item.productId}:${item.variantId}`;
        const prev = merged.get(key);
        merged.set(key, {
          ...item,
          quantity: item.quantity + (prev?.quantity || 0),
        });
      }
      const lines: OrderLine[] = [];
      const products = new Map<string, Product>();
      let capacityUnits = 0;
      for (const item of [...merged.values()].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        let p = products.get(item.productId);
        if (!p) {
          const query = em
            .getRepository(Product)
            .createQueryBuilder('p')
            .where('p.id = :id', { id: item.productId });
          if (this.db.options.type === 'postgres')
            query.setLock('pessimistic_write');
          p = (await query.getOne()) || undefined;
          if (p) products.set(p.id, p);
        }
        const v = p?.variants.find((v) => v.id === item.variantId);
        if (
          !p?.published ||
          !v ||
          v.stock < item.quantity ||
          item.quantity > 20
        )
          throw new ConflictException(
            'Une variante est indisponible. Vérifiez votre panier.',
          );
        if (p.madeToOrder) capacityUnits += item.quantity;
        v.stock -= item.quantity;
        const guide = await em.findOneBy(Setting, { id: 'size_guide' });
        lines.push({
          ...item,
          name: p.name,
          color: v.color,
          size: v.size,
          price: v.price,
          image: v.image,
          sizeGuide: guide?.value || null,
        });
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
      const total = subtotal + zone.fee;
      if (!Number.isSafeInteger(total) || total > 2147483647 || total !== dto.expectedTotal)
        throw new ConflictException(
          'Le prix a changé. Actualisez le panier et confirmez le nouveau total.',
        );
      const capacityPeriod = capacityUnits
        ? await this.reserveCapacity(em, capacityUnits)
        : undefined;
      for (const p of products.values()) await em.save(p);
      const now = new Date();
      const order = await em.save(Order, {
        id: `PL-${randomUUID()}`,
        userId: user.id,
        key: dto.key,
        items: lines,
        address: dto.address,
        subtotal,
        deliveryFee: zone.fee,
        total,
        termsVersion: dto.termsVersion,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        released: false,
        reservationExpiresAt: new Date(
          now.getTime() + 15 * 60000,
        ).toISOString(),
        history: [
          {
            status: 'awaiting_payment',
            date: now.toISOString(),
            note: 'Stock réservé pour 15 minutes.',
          },
        ],
      });
      if (capacityPeriod) {
        order.capacityPeriod = capacityPeriod;
        order.capacityUnits = capacityUnits;
        await em.save(order);
      }
      await this.audit(
        em,
        user.id,
        'order.reserve',
        order.id,
        'Réservation au passage de commande',
      );
      return order;
    });
  }
  async order(id: string, user: User) {
    const o = await this.db.getRepository(Order).findOneBy({ id });
    if (!o) throw new NotFoundException();
    if (o.userId !== user.id && user.role !== 'admin')
      throw new ForbiddenException();
    return o;
  }
  async release(em: EntityManager, o: Order, note: string) {
    if (!o.released) {
      for (const line of o.items) {
        const p = await em.findOneBy(Product, { id: line.productId });
        if (!p) continue;
        const v = p.variants.find((v) => v.id === line.variantId);
        if (v) v.stock += line.quantity;
        await em.save(p);
      }
      if (o.capacityPeriod) {
        const capacity = await em.findOneBy(ProductionCapacity, {
          id: o.capacityPeriod,
        });
        if (capacity) {
          capacity.reserved = Math.max(0, capacity.reserved - o.capacityUnits);
          await em.save(capacity);
        }
      }
      o.released = true;
    }
    o.status = 'cancelled';
    o.history.push({
      status: 'cancelled',
      date: new Date().toISOString(),
      note,
    });
    await em.save(o);
  }
  async cancel(id: string, user: User) {
    return this.transaction(async (em) => {
      const o = await em.findOneBy(Order, { id });
      if (!o) throw new NotFoundException();
      if (o.userId !== user.id && user.role !== 'admin')
        throw new ForbiddenException();
      if (o.status === 'cancelled') return o;
      if (o.paymentStatus === 'confirmed') {
        if (!o.paidAt || Date.now() - Date.parse(o.paidAt) > 86400000)
          throw new BadRequestException('Le délai de 24 heures est dépassé.');
        if (process.env.CANCELLATION_POLICY !== 'full_refund')
          throw new ServiceUnavailableException(
            'La politique de remboursement doit être validée. Contactez l’atelier pour votre demande.',
          );
        if (['in_delivery', 'delivered', 'exception'].includes(o.status))
          throw new BadRequestException(
            'Cette demande nécessite une résolution avec l’atelier.',
          );
        await em.save(Refund, {
          id: randomUUID(),
          orderId: o.id,
          amount: o.total,
          status: 'pending',
          reason: 'Annulation client avant 24 heures',
        });
        o.paymentStatus = 'refund_pending';
      }
      await this.release(em, o, 'Annulation avant paiement');
      await this.audit(em, user.id, 'order.cancel', id, 'Annulation demandée');
      return o;
    });
  }
  async expire() {
    return this.transaction(async (em) => {
      const pending = await em.find(Order, {
        where: { status: 'awaiting_payment', released: false },
      });
      for (const o of pending)
        if (o.reservationExpiresAt < new Date().toISOString())
          await this.release(
            em,
            o,
            'Réservation expirée sans confirmation de paiement',
          );
    });
  }
  async conversation(id: string, user: User) {
    const c = await this.db.getRepository(Conversation).findOneBy({ id });
    if (!c) throw new NotFoundException();
    if (c.userId !== user.id && user.role !== 'admin')
      throw new ForbiddenException();
    return c;
  }
  async send(id: string, dto: MessageDto, user: User) {
    await this.conversation(id, user);
    if (dto.kind === 'text' && !dto.text?.trim())
      throw new BadRequestException('Écrivez un message.');
    const previous = await this.db
      .getRepository(Message)
      .findOneBy({ conversationId: id, clientId: dto.clientId });
    if (previous) return { ...previous, audio: undefined };
    let audio: string | null = null;
    let mime: string | undefined = undefined;
    const messageId = randomUUID();
    if (dto.kind === 'audio') {
      if (!dto.audio || !dto.mime)
        throw new BadRequestException('Vocal manquant.');
      const validated = await this.audio.validate(dto.audio);
      mime = validated.mime;
      audio = await this.audio.store(dto.audio, mime, messageId);
    }
    return this.transaction(async (em) => {
      const existing = await em.findOneBy(Message, {
        conversationId: id,
        clientId: dto.clientId,
      });
      if (existing) return { ...existing, audio: undefined };
      const message = await em.save(Message, {
        id: messageId,
        conversationId: id,
        userId: user.id,
        clientId: dto.clientId,
        kind: dto.kind,
        text: dto.text?.trim() || '',
        audio,
        mime,
      });
      await em.update(Conversation, id, {
        updatedAt: new Date().toISOString(),
      });
      const conversation = await em.findOneBy(Conversation, { id });
      const recipients =
        user.role === 'admin'
          ? [conversation!.userId]
          : (await em.find(User, { where: { role: 'admin' } })).map(
              (u) => u.id,
            );
      for (const userId of recipients)
        await em.save(Notification, {
          id: randomUUID(),
          userId,
          kind: 'message',
          title: 'Nouveau message dans l’atelier',
          href: `/conversations?fil=${id}`,
          read: false,
        });
      return { ...message, audio: undefined };
    });
  }
  async metrics() {
    const orders = await this.db.getRepository(Order).find({ take: 5000 });
    const products = await this.products(true);
    const events = await this.db
      .getRepository(AnalyticsEvent)
      .find({ take: 20000 });
    const paid = orders.filter((o) => o.paymentStatus === 'confirmed');
    const ranked = products.map((p) => ({
      id: p.id,
      name: p.name,
      views: events.filter(
        (e) => e.productId === p.id && e.kind === 'product_view',
      ).length,
      adds: events.filter((e) => e.productId === p.id && e.kind === 'cart_add')
        .length,
      addedUnits: events
        .filter((e) => e.productId === p.id && e.kind === 'cart_add')
        .reduce((s, e) => s + e.quantity, 0),
      soldUnits: paid.reduce(
        (s, o) =>
          s +
          o.items
            .filter((i) => i.productId === p.id)
            .reduce((n, i) => n + i.quantity, 0),
        0,
      ),
    }));
    return {
      orders: orders.length,
      paidOrders: paid.length,
      revenue: paid.reduce((s, o) => s + o.subtotal, 0),
      deliveryRevenue: paid.reduce((s, o) => s + o.deliveryFee, 0),
      lowStock: products.flatMap((p) =>
        p.variants
          .filter((v) => v.stock <= 2)
          .map((v) => ({ name: p.name, ...v })),
      ),
      ranking: ranked.sort((a, b) => b.addedUnits - a.addedUnits),
      late: paid.filter(
        (o) =>
          o.deadline &&
          Date.parse(o.deadline) < Date.now() &&
          !['delivered', 'cancelled'].includes(o.status),
      ).length,
    };
  }
  async reserveCapacity(em: EntityManager, units: number) {
    const id = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Porto-Novo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const cap = await em.findOneBy(ProductionCapacity, { id });
    if (!cap || cap.reserved + units > cap.quota)
      throw new ConflictException(
        'La capacité de l’atelier est atteinte pour cette période. Aucune commande ne peut être promise sous trois jours.',
      );
    cap.reserved += units;
    await em.save(cap);
    return id;
  }
  async cart(user: User) {
    const saved = await this.db.getRepository(Cart).findOneBy({ id: user.id });
    const lines: OrderLine[] = [];
    for (const item of saved?.items || []) {
      const p = await this.db
        .getRepository(Product)
        .findOneBy({ id: item.productId, published: true });
      const v = p?.variants.find((v) => v.id === item.variantId);
      if (p && v)
        lines.push({
          ...item,
          name: p.name,
          color: v.color,
          size: v.size,
          price: v.price,
          image: v.image,
        });
    }
    return lines;
  }
  async checkoutOffer(id: string, dto: Omit<CheckoutDto, 'items'>, user: User) {
    if (process.env.COMMERCE_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Les ventes restent fermées avant validation de la livraison et du paiement.',
      );
    if (!dto.accepted)
      throw new BadRequestException('Acceptez les conditions.');
    const zone = (await this.zones()).find((z) => z.id === dto.address.zone);
    if (!zone) throw new BadRequestException('Zone non desservie.');
    return this.transaction(async (em) => {
      const previous = await em.findOneBy(Order, { offerId: id });
      if (previous) {
        if (previous.userId !== user.id) throw new ForbiddenException();
        return previous;
      }
      const offer = await em.findOneBy(Offer, { id, userId: user.id });
      if (
        !offer ||
        offer.status !== 'pending' ||
        Date.parse(offer.expiresAt) <= Date.now()
      )
        throw new BadRequestException(
          'Cette proposition a expiré ou a été remplacée.',
        );
      const total = offer.price + offer.deliveryFee;
      if (dto.expectedTotal !== total)
        throw new ConflictException('Vérifiez le montant de la proposition.');
      const period = await this.reserveCapacity(em, offer.quantity);
      const now = new Date();
      const order = await em.save(Order, {
        id: `PL-${randomUUID()}`,
        userId: user.id,
        key: dto.key,
        offerId: id,
        items: [
          {
            productId: 'custom',
            variantId: offer.id,
            name: `${offer.quantity} pièce(s) : ${offer.description}`,
            color: 'Personnalisation acceptée',
            size: `Proposition v${offer.version}`,
            quantity: 1,
            price: offer.price,
            image: '/atelier.svg',
          },
        ],
        address: dto.address,
        subtotal: offer.price,
        deliveryFee: offer.deliveryFee,
        total,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        released: false,
        termsVersion: dto.termsVersion,
        capacityPeriod: period,
        capacityUnits: offer.quantity,
        reservationExpiresAt: new Date(
          now.getTime() + 15 * 60000,
        ).toISOString(),
        history: [
          {
            status: 'awaiting_payment',
            date: now.toISOString(),
            note: `Proposition version ${offer.version} acceptée : ${offer.description}`,
          },
        ],
      });
      offer.status = 'accepted';
      await em.save(offer);
      await this.audit(
        em,
        user.id,
        'offer.accept',
        id,
        `Version ${offer.version}`,
      );
      return order;
    });
  }
}
