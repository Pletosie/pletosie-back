import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { entities, Product, User, Order, Conversation } from '../src/entities';
import { ShopService } from '../src/shop.service';
import { AudioService } from '../src/audio.service';
describe('Règles de commerce et accès', () => {
  let db: DataSource;
  let shop: ShopService;
  const user = { id: 'client-a', role: 'client' } as User;
  const other = { id: 'client-b', role: 'client' } as User;
  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqljs',
      entities,
      synchronize: true,
    }).initialize();
    shop = new ShopService(db, new AudioService());
    process.env.COMMERCE_ENABLED = 'true';
    process.env.DELIVERY_ZONES = '[{"id":"test","name":"Test","fee":500}]';
    await db
      .getRepository(Product)
      .save({
        id: 'piece',
        slug: 'piece',
        name: 'Pièce test',
        category: 'Robes',
        description: 'Pièce de test isolée',
        material: 'Coton',
        care: 'Lavage doux',
        price: 1000,
        image: '/test.svg',
        published: true,
        madeToOrder: false,
        variants: [
          {
            id: 'last',
            color: 'Noir',
            hex: '#000000',
            size: 'P1',
            stock: 1,
            price: 1000,
            image: '/test.svg',
          },
        ],
      });
  });
  afterEach(async () => {
    await db.destroy();
    delete process.env.COMMERCE_ENABLED;
    delete process.env.DELIVERY_ZONES;
  });
  const dto = (key: string) => ({
    key,
    items: [{ productId: 'piece', variantId: 'last', quantity: 1 }],
    address: {
      name: 'Test Client',
      phone: '0100000000',
      details: 'Adresse de test uniquement',
      zone: 'test',
    },
    accepted: true,
    termsVersion: '2026-10-draft' as const,
    expectedTotal: 1500,
  });
  it('refuse un total falsifié sans consommer le stock', async () => {
    await expect(
      shop.checkout({ ...dto('key-false'), expectedTotal: 1 }, user),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await shop.product('piece')).variants[0].stock).toBe(1);
  });
  it('une seule réservation gagne la dernière unité en concurrence', async () => {
    const results = await Promise.allSettled([
      shop.checkout(dto('key-first'), user),
      shop.checkout(dto('key-second'), other),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.getRepository(Order).count()).toBe(1);
    expect((await shop.product('piece')).variants[0].stock).toBe(0);
  });
  it('répéter une commande ne réserve pas deux fois', async () => {
    const a = await shop.checkout(dto('key-repeat'), user);
    const b = await shop.checkout(dto('key-repeat'), user);
    expect(a.id).toBe(b.id);
    expect((await shop.product('piece')).variants[0].stock).toBe(0);
  });
  it('annuler deux fois ne libère le stock qu’une fois', async () => {
    const o = await shop.checkout(dto('key-cancel'), user);
    await shop.cancel(o.id, user);
    await shop.cancel(o.id, user);
    expect((await shop.product('piece')).variants[0].stock).toBe(1);
  });
  it('un autre client ne peut lire ni annuler une commande', async () => {
    const o = await shop.checkout(dto('key-access'), user);
    await expect(shop.order(o.id, other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(shop.cancel(o.id, other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('un autre client ne peut lire une conversation', async () => {
    await db
      .getRepository(Conversation)
      .save({
        id: 'private',
        userId: user.id,
        productId: 'piece',
        subject: 'Privé',
        context: null,
        updatedAt: new Date().toISOString(),
        clientReadAt: '',
        adminReadAt: '',
      });
    await expect(shop.conversation('private', other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('une image renommée en vocal est refusée', async () => {
    await db
      .getRepository(Conversation)
      .save({
        id: 'private',
        userId: user.id,
        productId: 'piece',
        subject: 'Privé',
        context: null,
        updatedAt: new Date().toISOString(),
        clientReadAt: '',
        adminReadAt: '',
      });
    await expect(
      shop.send(
        'private',
        {
          clientId: 'fake-audio',
          kind: 'audio',
          audio: Buffer.from('this is not an audio file at all').toString(
            'base64',
          ),
          mime: 'audio/webm',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('les messages réessayés gardent le même identifiant', async () => {
    await db
      .getRepository(Conversation)
      .save({
        id: 'private',
        userId: user.id,
        productId: 'piece',
        subject: 'Privé',
        context: null,
        updatedAt: new Date().toISOString(),
        clientReadAt: '',
        adminReadAt: '',
      });
    const d = {
      clientId: 'retry-message',
      kind: 'text' as const,
      text: 'Bonjour atelier',
    };
    const a = await shop.send('private', d, user);
    const b = await shop.send('private', d, user);
    expect(a.id).toBe(b.id);
  });
  it('les réservations expirées sont libérées une seule fois', async () => {
    const o = await shop.checkout(dto('key-expire'), user);
    await db
      .getRepository(Order)
      .update(o.id, { reservationExpiresAt: '2000-01-01T00:00:00.000Z' });
    await shop.expire();
    await shop.expire();
    expect((await shop.product('piece')).variants[0].stock).toBe(1);
  });
});
