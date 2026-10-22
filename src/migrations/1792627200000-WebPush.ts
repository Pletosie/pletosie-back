import { MigrationInterface, QueryRunner } from 'typeorm';
export class WebPush1792627200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE notifications ADD COLUMN "pushQueued" boolean NOT NULL DEFAULT false`,
    );
    await q.query(`UPDATE notifications SET "pushQueued"=true`);
    await q.query(
      `CREATE TABLE push_subscriptions (id varchar PRIMARY KEY,"userId" varchar NOT NULL REFERENCES users(id),"sessionId" varchar NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,endpoint text NOT NULL,p256dh varchar NOT NULL,auth varchar NOT NULL,"createdAt" timestamp NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX push_subscription_user ON push_subscriptions ("userId")`,
    );
    await q.query(
      `CREATE TABLE push_deliveries (id varchar PRIMARY KEY,"notificationId" varchar NOT NULL REFERENCES notifications(id),"deviceId" varchar NOT NULL,status varchar NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,"nextAttemptAt" varchar NOT NULL,"leaseUntil" varchar)`,
    );
    await q.query(
      `CREATE INDEX push_delivery_pending ON push_deliveries(status,"nextAttemptAt")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE push_deliveries`);
    await q.query(`DROP TABLE push_subscriptions`);
    await q.query(`ALTER TABLE notifications DROP COLUMN "pushQueued"`);
  }
}
