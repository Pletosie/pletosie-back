import { createReceipt, receiptNumber } from './receipt';
import { videoUploadTicket, verifyProductVideo } from './product-videos';
import { VideoVerifyDto } from './dto';
import { HomepageDto } from './homepage.dto';
import {
  GoneException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID, timingSafeEqual, createHash } from 'crypto';
import { In } from 'typeorm';
import { ShopService } from './shop.service';
import { AuthGuard, AdminGuard, hashToken } from './auth';
import type { AuthRequest } from './auth';
import {
  CheckoutDto,
  ProductDto,
  ConversationDto,
  MessageDto,
  EventDto,
  StatusDto,
  OfferDto,
  PayDto,
  AddressDto,
  ProfileDto,
  RefundDto,
  CapacityDto,
  CartDto,
  OfferCheckoutDto,
} from './dto';
import {
  User,
  Session,
  Product,
  Order,
  Conversation,
  Message,
  AnalyticsEvent,
  Audit,
  Offer,
  PaymentAttempt,
  Notification,
  Address,
  Refund,
  ProductionCapacity,
  Cart,
  Setting,
  PushDevice,
} from './entities';
import { PaymentsService } from './payments.service';
import { GuideDto, ZonesDto } from './brand.dto';
@Controller()
export class ShopController {
  constructor(
    private shop: ShopService,
    private payments: PaymentsService,
  ) {}
  @Get('health') health() {
    return {
      status: 'ok',
      database: this.shop.db.options.type,
      commerceEnabled: process.env.COMMERCE_ENABLED === 'true',
    };
  }
  @Get('products') products() {
    return this.shop.products();
  }
  @Post('admin/videos/upload-ticket') @UseGuards(AuthGuard, AdminGuard)
  videoTicket() { return videoUploadTicket(); }
  @Post('admin/videos/verify') @UseGuards(AuthGuard, AdminGuard)
  verifyVideo(@Body() dto: VideoVerifyDto) { return verifyProductVideo(dto.publicId); }
  @Get('homepage') async homepage() {
    return (
      (await this.shop.db.getRepository(Setting).findOneBy({ id: 'homepage' }))?.value || null
    );
  }
  @Put('admin/homepage') @UseGuards(AuthGuard, AdminGuard)
  async saveHomepage(@Body() dto: HomepageDto, @Req() req: AuthRequest) {
    return this.shop.transaction(async (em) => {
      const ids = [...new Set([
        dto.heroProductId, ...dto.hero, ...dto.looks,
        ...dto.selection, ...dto.campaigns,
      ].filter(Boolean))];
      if (
        ids.length &&
        await em.countBy(Product, { id: In(ids), published: true }) !== ids.length
      )
        throw new BadRequestException(
          'Choisissez uniquement des articles publiés et existants.',
        );
      await em.save(Setting, { id: 'homepage', value: dto });
      await this.shop.audit(
        em, req.user.id, 'homepage.update', 'homepage',
        'Composition de la page d’accueil mise à jour',
      );
      return dto;
    });
  }
  @Get('settings') async settings() {
    return {
      zones: await this.shop.zones(),
      commerceEnabled: process.env.COMMERCE_ENABLED === 'true',
      paymentEnabled: this.payments.enabled(),
      operators: this.payments.enabled() ? this.payments.operators() : [],
      audioEnabled:
        process.env.NODE_ENV !== 'production' || this.shop.audio.cloudEnabled,
      termsVersion: '2026-10-draft',
      demo: process.env.SEED_DEMO === 'true',
    };
  }
  @Get('size-guide') async guide() {
    return (
      (
        await this.shop.db
          .getRepository(Setting)
          .findOneBy({ id: 'size_guide' })
      )?.value || null
    );
  }
  @Put('admin/size-guide') @UseGuards(AuthGuard, AdminGuard) async saveGuide(
    @Body() dto: GuideDto,
    @Req() req: AuthRequest,
  ) {
    if (
      new Set(dto.measurements.map((m) => m.size)).size !==
      dto.measurements.length
    )
      throw new BadRequestException('Les tailles doivent être uniques.');
    return this.shop.transaction(async (em) => {
      await em.save(Setting, { id: 'size_guide', value: dto });
      await this.shop.audit(
        em,
        req.user.id,
        'size-guide.update',
        dto.version,
        'Guide de mesures mis à jour',
      );
      return dto;
    });
  }
  @Put('admin/delivery-zones')
  @UseGuards(AuthGuard, AdminGuard)
  async saveZones(@Body() dto: ZonesDto, @Req() req: AuthRequest) {
    if (new Set(dto.zones.map((z) => z.id)).size !== dto.zones.length)
      throw new BadRequestException('Les zones doivent être uniques.');
    return this.shop.transaction(async (em) => {
      await em.save(Setting, { id: 'delivery_zones', value: dto.zones });
      await this.shop.audit(
        em,
        req.user.id,
        'delivery-zones.update',
        'delivery_zones',
        dto.reason,
      );
      return dto.zones;
    });
  }
  @Post('auth/register') register() {
    throw new GoneException('Utilisez la connexion Google.');
  }
  @Post('auth/login') login() {
    throw new GoneException('Utilisez la connexion Google.');
  }
  @Get('auth/me') @UseGuards(AuthGuard) me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Post('auth/logout') @UseGuards(AuthGuard) async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('pletosie_session='))
      ?.slice(17);
    if (token) {
      await this.shop.db
        .getRepository(PushDevice)
        .delete({ sessionId: hashToken(token) });
      await this.shop.db.getRepository(Session).delete(hashToken(token));
    }
    res.clearCookie('pletosie_session', { path: '/' });
    return { ok: true };
  }
  @Post('orders') @UseGuards(AuthGuard) checkout(
    @Body() dto: CheckoutDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.checkout(dto, req.user);
  }
  @Get('orders') @UseGuards(AuthGuard) orders(@Req() req: AuthRequest) {
    return this.shop.db.getRepository(Order).find({
      where: { userId: req.user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
  @Get('cart') @UseGuards(AuthGuard) cart(@Req() req: AuthRequest) {
    return this.shop.cart(req.user);
  }
  @Put('cart') @UseGuards(AuthGuard) async saveCart(
    @Body() dto: CartDto,
    @Req() req: AuthRequest,
  ) {
    const merged = new Map<
      string,
      { productId: string; variantId: string; quantity: number }
    >();
    for (const l of dto.items) {
      const k = `${l.productId}:${l.variantId}`;
      merged.set(k, {
        ...l,
        quantity: Math.min(20, l.quantity + (merged.get(k)?.quantity || 0)),
      });
    }
    await this.shop.db
      .getRepository(Cart)
      .save({ id: req.user.id, items: [...merged.values()] });
    return this.shop.cart(req.user);
  }
  @Get('admin/capacity') @UseGuards(AuthGuard, AdminGuard) capacity() {
    return this.shop.db
      .getRepository(ProductionCapacity)
      .find({ order: { id: 'DESC' }, take: 100 });
  }
  @Put('admin/capacity') @UseGuards(AuthGuard, AdminGuard) async updateCapacity(
    @Body() dto: CapacityDto,
    @Req() req: AuthRequest,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.date) ||
      !Number.isFinite(Date.parse(dto.date))
    )
      throw new BadRequestException('Date invalide.');
    return this.shop.transaction(async (em) => {
      const old = await em.findOneBy(ProductionCapacity, { id: dto.date });
      if ((old?.reserved || 0) > dto.quota)
        throw new ConflictException(
          'Ce quota est inférieur aux réservations existantes.',
        );
      const cap = await em.save(ProductionCapacity, {
        id: dto.date,
        quota: dto.quota,
        reserved: old?.reserved || 0,
      });
      await this.shop.audit(
        em,
        req.user.id,
        'capacity.update',
        dto.date,
        dto.reason,
      );
      return cap;
    });
  }
  @Get('orders/:id') @UseGuards(AuthGuard) order(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.shop.order(id, req.user);
  }
  @Post('orders/:id/cancel') @UseGuards(AuthGuard) cancel(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.shop.cancel(id, req.user);
  }
  @Post('orders/:id/pay') @UseGuards(AuthGuard) async pay(
    @Param('id') id: string,
    @Body() dto: PayDto,
    @Req() req: AuthRequest,
  ) {
    return this.payments.initiate(id, dto.operator, dto.phone, req.user);
  }
  @Get('orders/:id/payments') @UseGuards(AuthGuard) async attempts(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    await this.shop.order(id, req.user);
    return this.shop.db
      .getRepository(PaymentAttempt)
      .find({ where: { orderId: id }, take: 20, order: { createdAt: 'DESC' } });
  }
  @Get('payments/history')
  @UseGuards(AuthGuard)
  async paymentHistory(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'private, no-store');
    const attempts = await this.shop.db
      .getRepository(PaymentAttempt)
      .find({
        where: { userId: req.user.id },
        order: { createdAt: 'DESC' },
        take: 100,
      });
    const orders = attempts.length
      ? await this.shop.db
          .getRepository(Order)
          .findBy({ id: In([...new Set(attempts.map((a) => a.orderId))]) })
      : [];
    return attempts.map((a) => {
      const order = orders.find((o) => o.id === a.orderId);
      return {
        id: a.id,
        orderId: a.orderId,
        amount: a.amount,
        currency: a.currency,
        operator: a.operator,
        reference: a.reference,
        status: a.status,
        createdAt: a.createdAt,
        paidAt: order?.paidAt,
        receiptNumber: receiptNumber(a.id),
        receiptAvailable:
          a.status === 'confirmed' &&
          order?.paymentStatus === 'confirmed' &&
          Boolean(a.reference) &&
          a.amount === order.total &&
          a.currency === 'XOF',
      };
    });
  }
  @Get('payments/:id/receipt')
  @UseGuards(AuthGuard)
  async receipt(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const attempt = await this.shop.db
      .getRepository(PaymentAttempt)
      .findOneBy({ id });
    if (!attempt) throw new NotFoundException();
    const order = await this.shop.order(attempt.orderId, req.user);
    if (
      attempt.status !== 'confirmed' ||
      order.paymentStatus !== 'confirmed' ||
      !attempt.reference ||
      attempt.amount !== order.total ||
      attempt.currency !== 'XOF'
    )
      throw new ConflictException(
        'Le reçu est disponible uniquement après confirmation du paiement.',
      );
    const pdf = await createReceipt(order, attempt);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="' + receiptNumber(attempt.id) + '.pdf"',
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  }
  @Post('payments/:id/verify') @UseGuards(AuthGuard) verify(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.payments.verify(id, req.user);
  }
  @Post('payments/webhook') async webhook(@Req() req: AuthRequest) {
    const expected = process.env.FEEXPAY_WEBHOOK_SECRET;
    if (!expected || !this.payments.enabled())
      throw new UnauthorizedException();
    const digest = (v: string) => createHash('sha256').update(v).digest();
    if (
      !timingSafeEqual(
        digest(req.headers.authorization || ''),
        digest(`Bearer ${expected}`),
      )
    )
      throw new UnauthorizedException();
    void this.payments.reconcile();
    return { received: true };
  }
  @Get('notifications') @UseGuards(AuthGuard) notifications(
    @Req() req: AuthRequest,
  ) {
    return this.shop.db.getRepository(Notification).find({
      where: { userId: req.user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
  @Post('notifications/:id/read') @UseGuards(AuthGuard) async notificationRead(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    await this.shop.db
      .getRepository(Notification)
      .update({ id, userId: req.user.id }, { read: true });
    return { ok: true };
  }
  @Put('profile') @UseGuards(AuthGuard) async profile(
    @Body() dto: ProfileDto,
    @Req() req: AuthRequest,
  ) {
    await this.shop.db
      .getRepository(User)
      .update(req.user.id, { name: dto.name });
    return { ok: true };
  }
  @Get('addresses') @UseGuards(AuthGuard) addresses(@Req() req: AuthRequest) {
    return this.shop.db
      .getRepository(Address)
      .find({ where: { userId: req.user.id }, take: 20 });
  }
  @Post('addresses') @UseGuards(AuthGuard) async address(
    @Body() dto: AddressDto,
    @Req() req: AuthRequest,
  ) {
    if (
      (await this.shop.db
        .getRepository(Address)
        .countBy({ userId: req.user.id })) >= 20
    )
      throw new BadRequestException('Limite de 20 adresses atteinte.');
    return this.shop.db
      .getRepository(Address)
      .save({ id: randomUUID(), userId: req.user.id, ...dto });
  }
  @Get('admin/refunds') @UseGuards(AuthGuard, AdminGuard) refunds() {
    return this.shop.db
      .getRepository(Refund)
      .find({ order: { createdAt: 'DESC' }, take: 100 });
  }
  @Put('admin/refunds/:id') @UseGuards(AuthGuard, AdminGuard) async refund(
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.transaction(async (em) => {
      const refund = await em.findOneBy(Refund, { id });
      if (!refund || refund.status !== 'pending')
        throw new BadRequestException('Demande déjà traitée ou introuvable.');
      if (dto.status === 'confirmed' && !dto.transferReference)
        throw new BadRequestException(
          'La référence du transfert effectif est obligatoire.',
        );
      refund.status = dto.status;
      refund.reason = dto.reason;
      refund.transferReference = dto.transferReference || '';
      await em.save(refund);
      if (dto.status === 'confirmed')
        await em.update(Order, refund.orderId, { paymentStatus: 'refunded' });
      await this.shop.audit(em, req.user.id, 'refund.resolve', id, dto.reason);
      return refund;
    });
  }
  private async conversationViews(rows: Conversation[], viewer: User) {
    if (!rows.length) return [];
    const [people, products] = await Promise.all([
      this.shop.db.getRepository(User).find({
        where: { id: In([...new Set(rows.map((c) => c.userId))]) },
        select: { id: true, name: true },
      }),
      this.shop.db.getRepository(Product).find({
        where: {
          id: In([...new Set(rows.map((c) => c.productId).filter(Boolean))]),
        },
      }),
    ]);
    return rows.map((c) => {
      const person = people.find((p) => p.id === c.userId);
      const product = products.find((p) => p.id === c.productId);
      const variant = product?.variants.find(
        (v) => `${v.color} · ${v.size}` === c.context?.variant,
      );
      return {
        ...c,
        person: person ? { id: person.id, name: person.name } : null,
        displayName:
          viewer.role === 'admin'
            ? person?.name || 'Client Pletosie'
            : 'Atelier Pletosie',
        context: c.context
          ? {
              ...c.context,
              image: c.context.image || variant?.image || product?.image,
              price: c.context.price ?? variant?.price ?? product?.price,
              category: c.context.category || product?.category,
            }
          : null,
      };
    });
  }
  @Get('conversations') @UseGuards(AuthGuard) async conversations(
    @Req() req: AuthRequest,
  ) {
    const rows = await this.shop.db.getRepository(Conversation).find({
      where: req.user.role === 'admin' ? {} : { userId: req.user.id },
      order: { updatedAt: 'DESC' },
      take: 100,
    });
    return this.conversationViews(rows, req.user);
  }
  @Post('conversations') @UseGuards(AuthGuard) async createConversation(
    @Body() dto: ConversationDto,
    @Req() req: AuthRequest,
  ) {
    let context: Conversation['context'] = null;
    if (dto.productId) {
      const p = await this.shop.product(dto.productId);
      if (!p.published) throw new BadRequestException();
      const v = p.variants.find((v) => v.id === dto.variantId);
      if (dto.variantId && !v)
        throw new BadRequestException('Variante introuvable.');
      context = {
        name: p.name,
        slug: p.slug,
        variant: v ? `${v.color} · ${v.size}` : '',
        image: v?.image || p.image,
        price: v?.price ?? p.price,
        category: p.category,
      };
    }
    const conversation = await this.shop.transaction(async (em) => {
      const productId = dto.productId || '';
      if (this.shop.db.options.type === 'postgres')
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          req.user.id + ':' + productId,
        ]);
      const old = await em.findOne(Conversation, {
        where: { userId: req.user.id, productId },
        order: { updatedAt: 'ASC', id: 'ASC' },
      });
      if (old) {
        if (dto.variantId && context) {
          old.context = context;
          await em.save(old);
        }
        return old;
      }
      return em.save(Conversation, {
        id: randomUUID(),
        userId: req.user.id,
        productId,
        subject: context?.name || 'Échange avec l’atelier',
        context,
        updatedAt: new Date().toISOString(),
        clientReadAt: '',
        adminReadAt: '',
      });
    });
    return (await this.conversationViews([conversation], req.user))[0];
  }
  @Get('conversations/:id') @UseGuards(AuthGuard) async conversation(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const conversation = await this.shop.conversation(id, req.user);
    return (await this.conversationViews([conversation], req.user))[0];
  }
  @Get('conversations/:id/messages') @UseGuards(AuthGuard) async messages(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Query('before') before?: string,
  ) {
    await this.shop.conversation(id, req.user);
    const qb = this.shop.db
      .getRepository(Message)
      .createQueryBuilder('m')
      .where('m.conversationId = :id', { id });
    if (before) qb.andWhere('m.createdAt < :before', { before });
    const messages = await qb.orderBy('m.createdAt', 'DESC').take(50).getMany();
    return messages.reverse().map(({ audio, ...m }) => m);
  }
  @Post('conversations/:id/read') @UseGuards(AuthGuard) async read(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    await this.shop.conversation(id, req.user);
    await this.shop.db
      .getRepository(Conversation)
      .update(
        id,
        req.user.role === 'admin'
          ? { adminReadAt: new Date().toISOString() }
          : { clientReadAt: new Date().toISOString() },
      );
    await this.shop.db.getRepository(Notification).update(
      {
        userId: req.user.id,
        kind: 'message',
        href: `/conversations?fil=${id}`,
      },
      { read: true },
    );
    return { ok: true };
  }
  @Post('conversations/:id/messages') @UseGuards(AuthGuard) send(
    @Param('id') id: string,
    @Body() dto: MessageDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.send(id, dto, req.user);
  }
  @Get('messages/:id/audio') @UseGuards(AuthGuard) async audio(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const m = await this.shop.db.getRepository(Message).findOneBy({ id });
    if (!m || m.kind !== 'audio' || !m.audio) throw new NotFoundException();
    await this.shop.conversation(m.conversationId, req.user);
    const bytes = await this.shop.audio.read(m.audio);
    res.set({
      'Content-Type': m.mime,
      'Content-Length': String(bytes.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const total = bytes.length;
      let start = 0,
        end = total - 1;
      if (match && (match[1] || match[2])) {
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), total - 1);
        } else {
          start = Math.max(0, total - Number(match[2]));
        }
      }
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= total ||
        (!match[1] && Number(match[2]) === 0)
      ) {
        res
          .status(416)
          .set({ 'Content-Range': 'bytes */' + total, 'Content-Length': '0' })
          .end();
        return;
      }
      const part = bytes.subarray(start, end + 1);
      res
        .status(206)
        .set({
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
          'Content-Length': String(part.length),
        })
        .send(part);
      return;
    }
    res.send(bytes);
  }
  @Get('conversations/:id/offers') @UseGuards(AuthGuard) async offers(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    await this.shop.conversation(id, req.user);
    return this.shop.db
      .getRepository(Offer)
      .find({ where: { conversationId: id }, take: 100 });
  }
  @Post('conversations/:id/offers')
  @UseGuards(AuthGuard, AdminGuard)
  async offer(
    @Param('id') id: string,
    @Body() dto: OfferDto,
    @Req() req: AuthRequest,
  ) {
    const c = await this.shop.conversation(id, req.user);
    if (
      !Number.isFinite(Date.parse(dto.expiresAt)) ||
      Date.parse(dto.expiresAt) <= Date.now()
    )
      throw new BadRequestException('Expiration invalide.');
    return this.shop.transaction(async (em) => {
      await em.update(
        Offer,
        { conversationId: id, status: 'pending' },
        { status: 'superseded' },
      );
      const previous = await em.count(Offer, { where: { conversationId: id } });
      const offer = await em.save(Offer, {
        id: randomUUID(),
        conversationId: id,
        userId: c.userId,
        ...dto,
        status: 'pending',
        version: previous + 1,
      });
      await em.save(Notification, {
        id: randomUUID(),
        userId: c.userId,
        kind: 'offer',
        title: 'Une proposition de la créatrice vous attend',
        href: `/conversations?fil=${id}`,
        read: false,
      });
      return offer;
    });
  }
  @Get('offers/:id') @UseGuards(AuthGuard) async getOffer(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const o = await this.shop.db.getRepository(Offer).findOneBy({ id });
    if (!o) throw new NotFoundException();
    await this.shop.conversation(o.conversationId, req.user);
    return o;
  }
  @Post('offers/:id/accept') @UseGuards(AuthGuard) async acceptOffer(
    @Param('id') id: string,
    @Body() dto: OfferCheckoutDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.checkoutOffer(id, dto, req.user);
  }
  @Post('analytics') async event(
    @Body() dto: EventDto,
    @Req() req: AuthRequest,
  ) {
    if (
      !(await this.shop.db
        .getRepository(Product)
        .findOneBy({ id: dto.productId, published: true }))
    )
      throw new BadRequestException();
    const token = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('pletosie_session='))
      ?.slice(17);
    if (token) {
      const s = await this.shop.db
        .getRepository(Session)
        .findOneBy({ id: hashToken(token) });
      const u = s
        ? await this.shop.db.getRepository(User).findOneBy({ id: s.userId })
        : null;
      if (u?.role === 'admin') return { ok: true };
    }
    await this.shop.db
      .getRepository(AnalyticsEvent)
      .save({ id: randomUUID(), ...dto });
    return { ok: true };
  }
  @Get('admin/products') @UseGuards(AuthGuard, AdminGuard) adminProducts() {
    return this.shop.products(true);
  }
  @Post('admin/products') @UseGuards(AuthGuard, AdminGuard) createProduct(
    @Body() dto: ProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.saveProduct(null, dto, req.user);
  }
  @Put('admin/products/:id') @UseGuards(AuthGuard, AdminGuard) updateProduct(
    @Param('id') id: string,
    @Body() dto: ProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.saveProduct(id, dto, req.user);
  }
  @Get('admin/orders') @UseGuards(AuthGuard, AdminGuard) adminOrders() {
    return this.shop.db
      .getRepository(Order)
      .find({ order: { createdAt: 'DESC' }, take: 200 });
  }
  @Put('admin/orders/:id/status')
  @UseGuards(AuthGuard, AdminGuard)
  async status(
    @Param('id') id: string,
    @Body() dto: StatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.shop.transaction(async (em) => {
      const o = await em.findOneBy(Order, { id });
      if (!o || o.paymentStatus !== 'confirmed')
        throw new BadRequestException('Une commande payée est requise.');
      const transitions: Record<string, string> = {
        confirmed: 'preparing',
        preparing: 'ready',
        ready: 'in_delivery',
        in_delivery: 'delivered',
      };
      if (transitions[o.status] !== dto.status)
        throw new BadRequestException('Transition non autorisée.');
      o.status = dto.status;
      o.history.push({
        status: dto.status,
        date: new Date().toISOString(),
        note: dto.reason,
      });
      await em.save(o);
      await this.shop.audit(em, req.user.id, 'order.status', id, dto.reason);
      await em.save(Notification, {
        id: randomUUID(),
        userId: o.userId,
        kind: 'order_status',
        title: 'Votre commande avance dans l’atelier',
        href: '/commandes',
        read: false,
      });
      return o;
    });
  }
  @Get('admin/metrics') @UseGuards(AuthGuard, AdminGuard) metrics() {
    return this.shop.metrics();
  }
  @Get('admin/audit') @UseGuards(AuthGuard, AdminGuard) audit() {
    return this.shop.db
      .getRepository(Audit)
      .find({ order: { createdAt: 'DESC' }, take: 100 });
  }
}
