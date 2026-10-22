import { DataSource } from 'typeorm';
import {
  entities,
  Order,
  PaymentAttempt,
  Product,
  User,
  ProductionCapacity,
} from '../src/entities';
import { ShopService } from '../src/shop.service';
import { AudioService } from '../src/audio.service';
import { PaymentsService } from '../src/payments.service';
describe('Confirmation des paiements et capacité', () => {
  let db: DataSource;
  let shop: ShopService;
  let payments: PaymentsService;
  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqljs',
      entities,
      synchronize: true,
    }).initialize();
    shop = new ShopService(db, new AudioService());
    payments = new PaymentsService(shop);
    await db
      .getRepository(User)
      .save({
        id: 'client',
        name: 'Test',
        email: 'test@example.invalid',
        password: 'unused',
        role: 'client',
      });
    await db
      .getRepository(Product)
      .save({
        id: 'piece',
        slug: 'piece',
        name: 'Pièce test',
        category: 'Robes',
        description: 'Test',
        material: 'Coton',
        care: 'Doux',
        price: 1000,
        image: '/x.svg',
        published: true,
        madeToOrder: false,
        variants: [
          {
            id: 'v',
            color: 'Noir',
            hex: '#000000',
            size: 'P1',
            stock: 1,
            price: 1000,
            image: '/x.svg',
          },
        ],
      });
    await db
      .getRepository(Order)
      .save({
        id: 'o',
        userId: 'client',
        key: 'key',
        items: [
          {
            productId: 'piece',
            variantId: 'v',
            quantity: 1,
            price: 1000,
            name: 'Test',
            color: 'Noir',
            size: 'P1',
            image: '/x.svg',
          },
        ],
        address: {
          name: 'Test',
          phone: '0100000000',
          zone: 'test',
          details: 'Adresse test',
        },
        subtotal: 1000,
        deliveryFee: 0,
        total: 1000,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        released: false,
        reservationExpiresAt: new Date(Date.now() + 60000).toISOString(),
        history: [],
        termsVersion: 'test',
      });
    await db
      .getRepository(PaymentAttempt)
      .save({
        id: 'attempt',
        orderId: 'o',
        userId: 'client',
        amount: 1000,
        currency: 'XOF',
        operator: 'mtn',
        reference: 'ref',
        status: 'pending',
        updatedAt: new Date().toISOString(),
        checks: 0,
      });
  });
  afterEach(async () => {
    await db.destroy();
  });
  it('un callback répété ne confirme qu’une seule fois', async () => {
    const result = {
      reference: 'ref',
      amount: 1000,
      currency: 'XOF',
      status: 'SUCCESSFUL',
    };
    await payments.apply('attempt', result);
    const first = await db.getRepository(Order).findOneByOrFail({ id: 'o' });
    await payments.apply('attempt', result);
    const second = await db.getRepository(Order).findOneByOrFail({ id: 'o' });
    expect(second.history).toHaveLength(1);
    expect(second.paidAt).toBe(first.paidAt);
    expect(Date.parse(second.deadline) - Date.parse(second.paidAt)).toBe(
      3 * 86400000,
    );
  });
  it('un montant divergent ne valide pas la commande', async () => {
    await payments.apply('attempt', {
      reference: 'ref',
      amount: 1,
      status: 'SUCCESSFUL',
    });
    expect(
      (await db.getRepository(Order).findOneByOrFail({ id: 'o' }))
        .paymentStatus,
    ).toBe('pending');
  });
  it('un paiement tardif passe en exception et ne consomme pas le stock restauré', async () => {
    await db
      .getRepository(Order)
      .update('o', {
        released: true,
        status: 'cancelled',
        reservationExpiresAt: '2000-01-01T00:00:00.000Z',
      });
    await payments.apply('attempt', {
      reference: 'ref',
      amount: 1000,
      status: 'SUCCESSFUL',
    });
    expect(
      (await db.getRepository(Order).findOneByOrFail({ id: 'o' })).status,
    ).toBe('exception');
    expect((await db.getRepository(Order).findOneByOrFail({id:'o'})).deadline).toBeNull();
    expect((await shop.product('piece')).variants[0].stock).toBe(1);
  });
  it('le quota de confection bloque les réservations excédentaires', async () => {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Porto-Novo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await db
      .getRepository(ProductionCapacity)
      .save({ id: date, quota: 1, reserved: 0 });
    await shop.transaction((em) => shop.reserveCapacity(em, 1));
    await expect(
      shop.transaction((em) => shop.reserveCapacity(em, 1)),
    ).rejects.toThrow('capacité');
    expect(
      (await db.getRepository(ProductionCapacity).findOneByOrFail({ id: date }))
        .reserved,
    ).toBe(1);
  });
  it('une demande d’annulation après 24 heures est rejetée côté serveur', async () => {
    await db
      .getRepository(Order)
      .update('o', {
        paymentStatus: 'confirmed',
        status: 'confirmed',
        paidAt: new Date(Date.now() - 86400001).toISOString(),
      });
    await expect(
      shop.cancel('o', { id: 'client', role: 'client' } as User),
    ).rejects.toThrow('24 heures');
  });
  it('l’échéance exacte des 24 heures autorise la demande configurée', async () => {
    const now = 1792368000000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    process.env.CANCELLATION_POLICY = 'full_refund';
    try {
      await db
        .getRepository(Order)
        .update('o', {
          paymentStatus: 'confirmed',
          status: 'confirmed',
          paidAt: new Date(now - 86400000).toISOString(),
        });
      const o = await shop.cancel('o', {
        id: 'client',
        role: 'client',
      } as User);
      expect(o.status).toBe('cancelled');
      expect(o.paymentStatus).toBe('refund_pending');
    } finally {
      clock.mockRestore();
      delete process.env.CANCELLATION_POLICY;
    }
  });
});
