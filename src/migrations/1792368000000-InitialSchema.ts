import { MigrationInterface, QueryRunner } from 'typeorm';
export class InitialSchema1792368000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE users (id varchar PRIMARY KEY, name varchar NOT NULL, email varchar NOT NULL UNIQUE, password varchar NOT NULL, role varchar NOT NULL DEFAULT 'client', "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE sessions (id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id), "expiresAt" varchar NOT NULL)`,
    );
    await q.query(`CREATE INDEX sessions_user ON sessions ("userId")`);
    await q.query(
      `CREATE TABLE products (id varchar PRIMARY KEY, slug varchar NOT NULL UNIQUE, name varchar NOT NULL, category varchar NOT NULL, description text NOT NULL, material varchar NOT NULL, care varchar NOT NULL, price integer NOT NULL CHECK(price>0), image varchar NOT NULL, published boolean NOT NULL DEFAULT true, "madeToOrder" boolean NOT NULL DEFAULT false, variants text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE orders (id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id), key varchar NOT NULL, items text NOT NULL, address text NOT NULL, subtotal integer NOT NULL, "deliveryFee" integer NOT NULL, total integer NOT NULL, "paymentStatus" varchar NOT NULL DEFAULT 'pending', status varchar NOT NULL DEFAULT 'awaiting_payment', "paidAt" varchar, deadline varchar, "reservationExpiresAt" varchar NOT NULL, released boolean NOT NULL DEFAULT false, "termsVersion" varchar NOT NULL, history text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), UNIQUE("userId",key), CHECK(total=subtotal+"deliveryFee"))`,
    );
    await q.query(
      `CREATE INDEX orders_user_date ON orders ("userId","createdAt")`,
    );
    await q.query(`CREATE INDEX orders_status ON orders (status)`);
    await q.query(
      `CREATE TABLE conversations (id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id), "productId" varchar, subject varchar NOT NULL, context text, "updatedAt" varchar NOT NULL, "clientReadAt" varchar NOT NULL DEFAULT '', "adminReadAt" varchar NOT NULL DEFAULT '')`,
    );
    await q.query(
      `CREATE INDEX conversations_user ON conversations ("userId")`,
    );
    await q.query(
      `CREATE TABLE messages (id varchar PRIMARY KEY, "conversationId" varchar NOT NULL REFERENCES conversations(id), "userId" varchar NOT NULL REFERENCES users(id), "clientId" varchar NOT NULL, kind varchar NOT NULL, text text NOT NULL, audio text, mime varchar, "createdAt" timestamp NOT NULL DEFAULT now(), UNIQUE("conversationId","clientId"))`,
    );
    await q.query(
      `CREATE INDEX messages_conversation_date ON messages ("conversationId","createdAt")`,
    );
    await q.query(
      `CREATE TABLE offers (id varchar PRIMARY KEY, "conversationId" varchar NOT NULL REFERENCES conversations(id), "userId" varchar NOT NULL REFERENCES users(id), description text NOT NULL, price integer NOT NULL CHECK(price>0), "expiresAt" varchar NOT NULL, status varchar NOT NULL DEFAULT 'pending', version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE events (id varchar PRIMARY KEY, kind varchar NOT NULL, "productId" varchar NOT NULL REFERENCES products(id), quantity integer NOT NULL CHECK(quantity>0), "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE audit (id varchar PRIMARY KEY, actor varchar NOT NULL, action varchar NOT NULL, reference varchar NOT NULL, reason text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'audit',
      'events',
      'offers',
      'messages',
      'conversations',
      'orders',
      'products',
      'sessions',
      'users',
    ])
      await q.query(`DROP TABLE "${table}"`);
  }
}
