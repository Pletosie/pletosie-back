import { MigrationInterface, QueryRunner } from 'typeorm';
export class GoogleAuth1792368000002 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
    await q.query(`ALTER TABLE users ADD COLUMN "googleSub" varchar UNIQUE`);
    await q.query(
      `CREATE TABLE oauth_attempts (id varchar PRIMARY KEY,verifier varchar NOT NULL,nonce varchar NOT NULL,"expiresAt" varchar NOT NULL)`,
    );
    await q.query(`DELETE FROM sessions`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Google accounts have no local password; a destructive rollback is deliberately refused.
    const result = await q.query(
      `SELECT count(*)::int AS count FROM users WHERE password IS NULL`,
    );
    if (result[0].count > 0)
      throw new Error(
        'Des comptes Google existent sans mot de passe. Retour arrière à préparer explicitement.',
      );
    await q.query(`DROP TABLE oauth_attempts`);
    await q.query(`ALTER TABLE users DROP COLUMN "googleSub"`);
    await q.query(`ALTER TABLE users ALTER COLUMN password SET NOT NULL`);
  }
}
