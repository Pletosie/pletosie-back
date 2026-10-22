import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { entities, Product, Session, User, Audit } from '../src/entities';
import { ShopService } from '../src/shop.service';
import { ShopController } from '../src/shop.controller';
import { AudioService } from '../src/audio.service';
import { PaymentsService } from '../src/payments.service';
import { AuthGuard, AdminGuard, hashToken } from '../src/auth';
describe('Composition de l’accueil', () => {
  let app: INestApplication;
  let db: DataSource;
  const config = {
    heroProductId: 'p1',
    title: 'La nouvelle collection.',
    subtitle: 'Les nouveautés de l’atelier.',
    selectionTitle: 'Nos coups de cœur',
    hero: ['p2', 'p1'],
    looks: ['p1'],
    selection: ['p2', 'p1'],
    campaigns: [],
  };
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = app.get(DataSource);
    for (const role of ['admin', 'client']) {
      await db
        .getRepository(User)
        .save({ id: role, name: role, email: role + '@example.com', role });
      await db
        .getRepository(Session)
        .save({
          id: hashToken(role + '-session'),
          userId: role,
          expiresAt: '2100-01-01',
        });
    }
    for (const id of ['p1', 'p2', 'draft'])
      await db
        .getRepository(Product)
        .save({
          id,
          slug: id,
          name: id,
          category: 'Robes',
          description: 'Description',
          material: 'Coton',
          care: 'Lavage doux',
          price: 1000,
          image: '/test.png',
          variants: [],
          published: id !== 'draft',
        });
  });
  afterAll(async () => {
    await app.close();
  });
  it('laisse l’accueil automatique tant qu’aucune composition n’est publiée', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/homepage')
      .expect(200);
    expect(result.text).toBe('');
  });
  it('réserve la publication à l’administration', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/admin/homepage')
      .send(config)
      .expect(401);
    await request(app.getHttpServer())
      .put('/api/v1/admin/homepage')
      .set('Cookie', 'pletosie_session=client-session')
      .send(config)
      .expect(403);
  });
  it('enregistre l’ordre exact, les sections vides et le journal', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/admin/homepage')
      .set('Cookie', 'pletosie_session=admin-session')
      .send(config)
      .expect(200);
    const result = await request(app.getHttpServer())
      .get('/api/v1/homepage')
      .expect(200);
    expect(result.body).toEqual(config);
    expect(
      await db.getRepository(Audit).countBy({ action: 'homepage.update' }),
    ).toBe(1);
  });
  it('refuse les brouillons, références inexistantes, doublons et emplacements excessifs', async () => {
    for (const update of [
      { heroProductId: 'draft' },
      { hero: ['missing'] },
      { selection: ['p1', 'p1'] },
      { hero: ['p1', 'p2', 'draft'] },
      { title: '' },
      { unexpected: true },
    ]) {
      await request(app.getHttpServer())
        .put('/api/v1/admin/homepage')
        .set('Cookie', 'pletosie_session=admin-session')
        .send({ ...config, ...update })
        .expect(400);
    }
    expect(
      (await request(app.getHttpServer()).get('/api/v1/homepage')).body,
    ).toEqual(config);
  });
});
