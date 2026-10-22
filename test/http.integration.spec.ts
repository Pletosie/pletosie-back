import { GoogleAuthController, GoogleAuthService } from '../src/google-auth';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  entities,
  User,
  Product,
  Conversation,
  Session,
  Message,
} from '../src/entities';
import { ShopService } from '../src/shop.service';
import { ShopController } from '../src/shop.controller';
import { AuthGuard, AdminGuard, hashToken } from '../src/auth';
import { AudioService } from '../src/audio.service';
import { PaymentsService } from '../src/payments.service';
import { DataSource } from 'typeorm';
describe('Parcours HTTP authentifié', () => {
  let app: INestApplication;
  let cookie: string;
  let clientId: string;
  let conversationId: string;
  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_CALLBACK_URL =
      'http://localhost:4000/api/v1/auth/google/callback';
    const m = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqljs', entities, synchronize: true }),
      ],
      controllers: [ShopController, GoogleAuthController],
      providers: [
        ShopService,
        AuthGuard,
        AdminGuard,
        AudioService,
        PaymentsService,
        GoogleAuthService,
      ],
    }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;
  });
  it('connecte avec Google et pose un cookie HttpOnly', async () => {
    const service = app.get(GoogleAuthService);
    const profile = {
      sub: 'google-http-client',
      email: 'test@gmail.com',
      email_verified: true,
      name: 'Client Google',
      iss: 'https://accounts.google.com',
      aud: 'test-client',
      iat: 1,
      exp: 9999999999,
    };
    const spy = jest
      .spyOn(service, 'complete')
      .mockImplementation(async () => service.resolveUser(profile));
    const begin = await request(app.getHttpServer())
      .get('/api/v1/auth/google')
      .expect(302);
    const state = new URL(begin.headers.location).searchParams.get('state');
    const oauthCookie = begin.headers['set-cookie'][0].split(';')[0];
    const r = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state, code: 'test-code' })
      .set('Cookie', oauthCookie)
      .expect(302);
    expect(r.headers.location).toBe('http://localhost:3000/compte');
    const sessionCookie = r.headers['set-cookie'].find((x: string) =>
      x.startsWith('pletosie_session='),
    );
    expect(sessionCookie).toContain('HttpOnly');
    cookie = sessionCookie.split(';')[0];
    clientId = (
      await app
        .get(DataSource)
        .getRepository(User)
        .findOneByOrFail({ email: 'test@gmail.com' })
    ).id;
    spy.mockRestore();
  });
  it('récupère le compte par cookie', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(r.body.id).toBe(clientId);
    expect(r.body.password).toBeUndefined();
  });
  it('interdit l’administration à un client et à un visiteur', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .expect(401);
  });
  it('ne permet pas de choisir son rôle à l’inscription', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Bad',
        email: 'bad@example.invalid',
        password: 'a-long-test-password',
        role: 'admin',
      })
      .expect(410);
  });
  it('crée une conversation privée et persiste le texte', async () => {
    const c = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', cookie)
      .send({})
      .expect(201);
    conversationId = c.body.id;
    const body = {
      kind: 'text',
      text: 'Bonjour, je souhaite une création.',
      clientId: 'stable-message-id',
    };
    const a = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    const b = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    expect(a.body.id).toBe(b.body.id);
    const messages = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .expect(200);
    expect(messages.body).toHaveLength(1);
  });
  it('conserve les emojis, accents et retours à la ligne sans altération', async () => {
    const text='Bonjour 👋🏾🥰 ! Cette robe 😍\nFamille 👨‍👩‍👧‍👦 · 🇧🇯 · ❤️ · café';
    const sent=await request(app.getHttpServer()).post(`/api/v1/conversations/${conversationId}/messages`).set('Cookie',cookie).send({kind:'text',text,clientId:'unicode-emoji-test'}).expect(201);
    expect(sent.body.text).toBe(text);
    const messages=await request(app.getHttpServer()).get(`/api/v1/conversations/${conversationId}/messages`).set('Cookie',cookie).expect(200);
    expect(messages.body.find((m:{id:string})=>m.id===sent.body.id).text).toBe(text);
  });
  it('refuse les pièces jointes non prévues', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .send({
        kind: 'text',
        text: 'x',
        clientId: 'bad-attachment',
        image: 'evil.png',
      })
      .expect(400);
  });
  it('ouvre ou retrouve la discussion produit sans doublon en cas de clic répété', async () => {
    await app
      .get(DataSource)
      .getRepository(Product)
      .save({
        id: 'discussion-product',
        slug: 'discussion-product',
        name: 'Pièce à discuter',
        category: 'Robes',
        description: 'Article de test pour discussion',
        material: 'Coton',
        care: 'Lavage doux',
        price: 1000,
        image: '/test.svg',
        published: true,
        madeToOrder: false,
        variants: [
          {
            id: 'discussion-variant',
            color: 'Noir',
            hex: '#000000',
            size: 'P1',
            stock: 1,
            price: 1000,
            image: '/test.svg',
          },
        ],
      });
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/conversations')
          .set('Cookie', cookie)
          .send({
            productId: 'discussion-product',
            variantId: 'discussion-variant',
          })
          .expect(201),
      ),
    );
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(responses[0].body.context.variant).toBe('Noir · P1');
    expect(
      await app
        .get(DataSource)
        .getRepository(Conversation)
        .countBy({ userId: clientId, productId: 'discussion-product' }),
    ).toBe(1);
    const detail = await request(app.getHttpServer())
      .get('/api/v1/conversations/' + responses[0].body.id)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body.context.slug).toBe('discussion-product');
  });
  it('refuse une variante inexistante lors de l’ouverture de discussion', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', cookie)
      .send({ productId: 'discussion-product', variantId: 'missing' })
      .expect(400);
  });
  it('identifie chaque personne et enrichit aussi les anciennes discussions avec la photo et le prix', async () => {
    const db = app.get(DataSource);
    for (const [id, name, role] of [
      ['second-client', 'Aïcha Test', 'client'],
      ['test-admin', 'Atelier Test', 'admin'],
    ]) {
      await db
        .getRepository(User)
        .save({ id, name, role, email: id + '@example.test' });
      await db
        .getRepository(Session)
        .save({
          id: hashToken(id + '-session'),
          userId: id,
          expiresAt: '2099-01-01T00:00:00.000Z',
        });
    }
    const second = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', 'pletosie_session=second-client-session')
      .send({ productId: 'discussion-product' })
      .expect(201);
    expect(second.body.displayName).toBe('Atelier Pletosie');
    expect(second.body.context).toMatchObject({
      image: '/test.svg',
      price: 1000,
      category: 'Robes',
    });
    await db
      .getRepository(Conversation)
      .update(second.body.id, {
        context: {
          name: 'Pièce à discuter',
          slug: 'discussion-product',
          variant: '',
        },
      });
    const all = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', 'pletosie_session=test-admin-session')
      .expect(200);
    const related = all.body.filter(
      (c: { productId: string }) => c.productId === 'discussion-product',
    );
    expect(related).toHaveLength(2);
    expect(related.map((c: { displayName: string }) => c.displayName)).toEqual(
      expect.arrayContaining(['Client Google', 'Aïcha Test']),
    );
    expect(
      related.find((c: { userId: string }) => c.userId === 'second-client')
        .context,
    ).toMatchObject({ image: '/test.svg', price: 1000 });
    expect(
      related.every(
        (c: { person: object }) =>
          Object.keys(c.person).sort().join(',') === 'id,name',
      ),
    ).toBe(true);
    const own = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      own.body.some((c: { userId: string }) => c.userId === 'second-client'),
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/api/v1/conversations/' + second.body.id)
      .set('Cookie', cookie)
      .expect(403);
  });
  it('réserve les imports vidéo à l’administration', async () => {
    await request(app.getHttpServer()).post('/api/v1/admin/videos/upload-ticket').send({}).expect(401);
    await request(app.getHttpServer()).post('/api/v1/admin/videos/upload-ticket').set('Cookie', cookie).send({}).expect(403);
    await request(app.getHttpServer()).post('/api/v1/admin/videos/verify').set('Cookie', cookie).send({publicId:'pletosie/creations/test'}).expect(403);
  });
  it('sert les portions audio et protège toujours le vocal', async () => {
    const bytes = Buffer.from('0123456789');
    await app
      .get(DataSource)
      .getRepository(Message)
      .save({
        id: 'range-audio', clientId: 'range-audio', text: '',
        conversationId,
        userId: clientId,
        kind: 'audio',
        audio: bytes.toString('base64'),
        mime: 'audio/webm',
      });
    const url = '/api/v1/messages/range-audio/audio';
    await request(app.getHttpServer())
      .get(url)
      .set('Range', 'bytes=0-3')
      .expect(401);
    const full = await request(app.getHttpServer())
      .get(url)
      .set('Cookie', cookie)
      .expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.body).toEqual(bytes);
    for (const [range, contentRange, expected] of [
      ['bytes=3-6', 'bytes 3-6/10', '3456'],
      ['bytes=7-', 'bytes 7-9/10', '789'],
      ['bytes=-2', 'bytes 8-9/10', '89'],
      ['bytes=8-100', 'bytes 8-9/10', '89'],
    ]) {
      const part = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', cookie)
        .set('Range', range)
        .expect(206);
      expect(part.headers['content-range']).toBe(contentRange);
      expect(part.body).toEqual(Buffer.from(expected));
    }
    for (const range of [
      'bytes=20-',
      'bytes=5-2',
      'bytes=-0',
      'bytes=-',
      'bytes=0-1,3-4',
    ]) {
      await request(app.getHttpServer())
        .get(url)
        .set('Cookie', cookie)
        .set('Range', range)
        .expect(416)
        .expect('Content-Range', 'bytes */10');
    }
  });
  it('révoque la session à la déconnexion', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });
});
