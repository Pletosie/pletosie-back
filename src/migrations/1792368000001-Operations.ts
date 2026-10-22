import { MigrationInterface, QueryRunner } from 'typeorm';
export class Operations1792368000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE payment_attempts (id varchar PRIMARY KEY, "orderId" varchar NOT NULL REFERENCES orders(id), "userId" varchar NOT NULL REFERENCES users(id), amount integer NOT NULL CHECK(amount>0), currency varchar NOT NULL DEFAULT 'XOF', operator varchar NOT NULL, reference varchar UNIQUE, status varchar NOT NULL DEFAULT 'created', checks integer NOT NULL DEFAULT 0, "updatedAt" varchar NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(`CREATE INDEX payment_order ON payment_attempts ("orderId")`);
    await q.query(
      `CREATE TABLE notifications (id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id), kind varchar NOT NULL, title varchar NOT NULL, href varchar NOT NULL, read boolean NOT NULL DEFAULT false, "createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX notifications_user ON notifications ("userId",read)`,
    );
    await q.query(
      `CREATE TABLE settings (id varchar PRIMARY KEY,value text NOT NULL)`,
    );
    await q.query(
      `CREATE TABLE addresses (id varchar PRIMARY KEY,"userId" varchar NOT NULL REFERENCES users(id),name varchar NOT NULL,phone varchar NOT NULL,details varchar NOT NULL,zone varchar NOT NULL)`,
    );
    await q.query(
      `CREATE TABLE refunds (id varchar PRIMARY KEY,"orderId" varchar NOT NULL REFERENCES orders(id),amount integer NOT NULL CHECK(amount>0),status varchar NOT NULL,reason varchar NOT NULL,"transferReference" varchar,"createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE production_capacity (id varchar PRIMARY KEY,quota integer NOT NULL CHECK(quota>=0),reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0))`,
    );
    await q.query(
      `CREATE TABLE carts (id varchar PRIMARY KEY REFERENCES users(id),items text NOT NULL)`,
    );
    await q.query(
      `ALTER TABLE orders ADD COLUMN "capacityPeriod" varchar, ADD COLUMN "capacityUnits" integer NOT NULL DEFAULT 0, ADD COLUMN "offerId" varchar UNIQUE REFERENCES offers(id)`,
    );
    await q.query(
      `ALTER TABLE offers ADD COLUMN quantity integer NOT NULL DEFAULT 1, ADD COLUMN "deliveryFee" integer NOT NULL DEFAULT 0`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE orders DROP COLUMN "capacityPeriod", DROP COLUMN "capacityUnits", DROP COLUMN "offerId"`,
    );
    await q.query(
      `ALTER TABLE offers DROP COLUMN quantity, DROP COLUMN "deliveryFee"`,
    );
    for (const table of [
      'carts',
      'production_capacity',
      'refunds',
      'addresses',
      'settings',
      'notifications',
      'payment_attempts',
    ])
      await q.query(`DROP TABLE "${table}"`);
  }
}
