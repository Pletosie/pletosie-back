import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProductVideos1792882800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE products ADD COLUMN "videos" text NOT NULL DEFAULT '[]'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE products DROP COLUMN "videos"');
  }
}
