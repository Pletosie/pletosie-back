import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ShopService } from './shop.service';
import { Notification, Order, PaymentAttempt, User } from './entities';
type ProviderResult = {
  reference?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  callback_info?: unknown;
  env?: string;
};
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval>;
  constructor(readonly shop: ShopService) {}
  enabled() {
    return (
      process.env.FEEXPAY_ENABLED === 'true' &&
      Boolean(process.env.FEEXPAY_API_KEY && process.env.FEEXPAY_SHOP_ID)
    );
  }
  operators() {
    return (process.env.FEEXPAY_OPERATORS || '')
      .split(',')
      .filter((o) => ['mtn', 'moov', 'celtiis_bj'].includes(o));
  }
  base() {
    return process.env.FEEXPAY_MODE === 'live'
      ? 'https://api-v2.feexpay.me'
      : 'https://sandbox-api.feexpay.me';
  }
  async request(path: string, body?: unknown): Promise<ProviderResult> {
    const r = await fetch(`${this.base()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${process.env.FEEXPAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok)
      throw new ServiceUnavailableException(
        'FeexPay ne peut pas répondre. La tentative reste à rapprocher avant toute relance.',
      );
    return (await r.json()) as ProviderResult;
  }
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.reconcile().catch(() =>
        console.error('Rapprochement FeexPay à relancer'),
      );
    }, 60000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async initiate(id: string, operator: string, phone: string, user: User) {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        'FeexPay attend la configuration et la vérification du compte marchand. Aucun encaissement n’a été lancé.',
      );
    if (!this.operators().includes(operator) || !/^22901\d{8}$/.test(phone))
      throw new BadRequestException(
        'Opérateur ou numéro béninois invalide (22901 suivi de 8 chiffres).',
      );
    const attempt = await this.shop.transaction(async (em) => {
      const o = await em.findOneBy(Order, { id, userId: user.id });
      if (!o) throw new ForbiddenException();
      if (
        o.status !== 'awaiting_payment' ||
        o.released ||
        Date.parse(o.reservationExpiresAt) <= Date.now()
      )
        throw new BadRequestException(
          'La réservation a expiré ou la commande est déjà traitée.',
        );
      const old = await em.find(PaymentAttempt, { where: { orderId: id } });
      if (old.some((a) => !['failed'].includes(a.status)))
        throw new BadRequestException(
          'Une tentative existe déjà. Vérifiez son statut avant de relancer.',
        );
      return em.save(PaymentAttempt, {
        id: randomUUID(),
        orderId: id,
        userId: user.id,
        amount: o.total,
        currency: 'XOF',
        operator,
        status: 'initiating',
        updatedAt: new Date().toISOString(),
        checks: 0,
      });
    });
    try {
      const result = await this.request(
        `/api/transactions/public/requesttopay/${operator}`,
        {
          shop: process.env.FEEXPAY_SHOP_ID,
          amount: attempt.amount,
          phoneNumber: phone,
          description: attempt.id,
          callback_info: attempt.id,
        },
      );
      if (!result.reference) throw new ServiceUnavailableException();
      await this.shop.db
        .getRepository(PaymentAttempt)
        .update(attempt.id, {
          reference: result.reference,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        });
      return await this.verify(attempt.id, user);
    } catch {
      await this.shop.db
        .getRepository(PaymentAttempt)
        .update(attempt.id, {
          status: 'unknown',
          updatedAt: new Date().toISOString(),
        });
      throw new ServiceUnavailableException(
        'Statut de paiement inconnu. Ne relancez pas un paiement : le serveur rapproche cette tentative.',
      );
    }
  }
  async verify(id: string, user?: User) {
    const a = await this.shop.db
      .getRepository(PaymentAttempt)
      .findOneBy({ id });
    if (!a || (user && a.userId !== user.id && user.role !== 'admin'))
      throw new ForbiddenException();
    if (['confirmed', 'failed', 'exception'].includes(a.status)) return a;
    const endpoint = a.reference
      ? encodeURIComponent(a.reference)
      : `${encodeURIComponent(a.id)}?by=description`;
    const result = await this.request(
      `/api/transactions/public/single/status/${endpoint}`,
    );
    return this.apply(a.id, result);
  }
  async apply(id: string, result: ProviderResult) {
    return this.shop.transaction(async (em) => {
      const a = await em.findOneBy(PaymentAttempt, { id });
      if (!a) throw new BadRequestException();
      if (['confirmed', 'failed', 'exception'].includes(a.status)) return a;
      const o = await em.findOneBy(Order, { id: a.orderId });
      if (!o) throw new BadRequestException();
      const referenceMatches =
        Boolean(result.reference) &&
        (!a.reference || result.reference === a.reference);
      const amountMatches = Number(result.amount) === a.amount;
      const currencyMatches = !result.currency || result.currency === 'XOF';
      const environmentMatches =
        !result.env ||
        result.env ===
          (process.env.FEEXPAY_MODE === 'live' ? 'live' : 'sandbox');
      if (
        !referenceMatches ||
        !amountMatches ||
        !currencyMatches ||
        !environmentMatches
      ) {
        a.status = 'unknown';
        await this.shop.audit(
          em,
          'system',
          'payment.mismatch',
          a.id,
          'Référence, montant, devise ou environnement non conforme',
        );
      } else if (result.status === 'SUCCESSFUL') {
        a.reference = result.reference!;
        const late =
          o.released ||
          Date.parse(o.reservationExpiresAt) < Date.now() ||
          o.paymentStatus === 'confirmed';
        a.status = late ? 'exception' : 'confirmed';
        o.paymentStatus = 'confirmed';
        o.status = late ? 'exception' : 'confirmed';
        o.paidAt = o.paidAt || new Date().toISOString();
        if (!late) o.deadline = new Date(Date.parse(o.paidAt) + 3 * 86400000).toISOString();
        o.history.push({
          status: o.status,
          date: o.paidAt,
          note: late
            ? 'Paiement tardif ou double : résolution administrative requise.'
            : 'Paiement vérifié auprès de FeexPay.',
        });
        await em.save(o);
        const admins = await em.find(User, { where: { role: 'admin' } });
        for (const userId of [o.userId, ...admins.map((u) => u.id)])
          await em.save(Notification, {
            id: randomUUID(),
            userId,
            kind: 'order_paid',
            title: late ? 'Paiement à examiner' : 'Commande payée',
            href: userId === o.userId ? '/commandes' : '/admin',
            read: false,
          });
        await this.shop.audit(
          em,
          'system',
          'payment.confirmed',
          o.id,
          late ? 'Exception de paiement' : 'Confirmation serveur FeexPay',
        );
      } else if (result.status === 'FAILED') {
        a.status = 'failed';
        o.paymentStatus = 'failed';
        await em.save(o);
      } else a.status = 'pending';
      a.checks++;
      a.updatedAt = new Date().toISOString();
      return em.save(a);
    });
  }
  async reconcile() {
    if (!this.enabled()) return;
    const list = await this.shop.db
      .getRepository(PaymentAttempt)
      .find({
        where: [
          { status: 'pending' },
          { status: 'unknown' },
          { status: 'initiating' },
        ],
        order: { createdAt: 'ASC' },
        take: 20,
      });
    for (const a of list)
      if (a.checks < 120)
        try {
          await this.verify(a.id);
        } catch {
          await this.shop.db
            .getRepository(PaymentAttempt)
            .update(a.id, { checks: a.checks + 1 });
        }
  }
}
