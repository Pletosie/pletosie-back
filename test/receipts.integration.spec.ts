import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  entities,
  User,
  Session,
  Order,
  PaymentAttempt,
} from '../src/entities';
import { ShopController } from '../src/shop.controller';
import { ShopService } from '../src/shop.service';
import { AudioService } from '../src/audio.service';
import { PaymentsService } from '../src/payments.service';
import { AuthGuard, AdminGuard, hashToken } from '../src/auth';
describe('Reçus et historique des paiements', () => {
  let app: INestApplication, db: DataSource;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqljs', entities, synchronize: true }),
      ],
      controllers: [ShopController],
      providers: [
        ShopService,
        AudioService,
        PaymentsService,
        AuthGuard,
        AdminGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(DataSource);
    for (const id of ['owner', 'other', 'admin']) {
      await db
        .getRepository(User)
        .save({
          id,
          name: id,
          email: id + '@example.com',
          role: id === 'admin' ? 'admin' : 'client',
        });
      await db
        .getRepository(Session)
        .save({ id: hashToken(id), userId: id, expiresAt: '2100-01-01' });
    }
    for (const id of ['paid', 'unpaid'])
      await db
        .getRepository(Order)
        .save({
          id,
          userId: 'owner',
          key: id,
          items: [
            {
              productId: 'p',
              variantId: 'v',
              name: 'Robe Amara',
              color: 'Bleu nuit',
              size: 'M',
              price: 18500,
              quantity: 1,
              image: '/test.png',
            },
          ],
          address: {
            name: 'Aïcha Démo',
            phone: '2290100000000',
            details: 'Adresse de démonstration',
            zone: 'cotonou',
          },
          subtotal: 18500,
          deliveryFee: 1000,
          total: 19500,
          status: id === 'paid' ? 'confirmed' : 'awaiting_payment',
          paymentStatus: id === 'paid' ? 'confirmed' : 'pending',
          paidAt: id === 'paid' ? '2026-10-22T12:00:00Z' : undefined,
          reservationExpiresAt: '2100-01-01',
          termsVersion: '2026-10-draft',
          history: [],
        });
    for (const [id, status, orderId, userId, amount] of [
      ['confirmed', 'confirmed', 'paid', 'owner', 19500],
      ['pending', 'pending', 'unpaid', 'owner', 19500],
      ['exception', 'exception', 'paid', 'owner', 19500],
      ['mismatch', 'confirmed', 'paid', 'owner', 100],
      ['foreign', 'pending', 'unpaid', 'other', 19500],
    ] as const)
      await db
        .getRepository(PaymentAttempt)
        .save({
          id,
          status,
          orderId,
          userId,
          amount,
          currency: 'XOF',
          operator: 'mtn',
          reference: 'TX-' + id,
          updatedAt: '2026-10-22T12:00:00Z',
        });
  });
  afterAll(async () => {
    await app.close();
  });
  it('réserve le PDF au propriétaire ou à l’administration', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/confirmed/receipt')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/payments/confirmed/receipt')
      .set('Cookie', 'pletosie_session=other')
      .expect(403);
    for (const owner of ['owner', 'admin']) {
      const result = await request(app.getHttpServer())
        .get('/api/v1/payments/confirmed/receipt')
        .set('Cookie', 'pletosie_session=' + owner)
        .expect(200)
        .expect('Content-Type', /application\/pdf/);
      expect(result.body.subarray(0, 4).toString()).toBe('%PDF');
      expect(result.headers['cache-control']).toContain('no-store');
      expect(result.headers['content-disposition']).toContain('attachment');
    }
  });
  it('ne produit pas de reçu pour un paiement en attente, en anomalie ou de montant incorrect', async () => {
    for (const id of ['pending', 'exception', 'mismatch'])
      await request(app.getHttpServer())
        .get('/api/v1/payments/' + id + '/receipt')
        .set('Cookie', 'pletosie_session=owner')
        .expect(409);
  });
  it('isole l’historique de chaque compte et indique les reçus réellement disponibles', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/payments/history')
      .set('Cookie', 'pletosie_session=owner')
      .expect(200);
    expect(result.body).toHaveLength(4);
    expect(result.body.some((p: { id: string }) => p.id === 'foreign')).toBe(
      false,
    );
    expect(
      result.body
        .filter((p: { receiptAvailable: boolean }) => p.receiptAvailable)
        .map((p: { id: string }) => p.id),
    ).toEqual(['confirmed']);
  });
});
