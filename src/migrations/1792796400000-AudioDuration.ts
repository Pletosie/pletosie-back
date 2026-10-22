import { MigrationInterface, QueryRunner } from 'typeorm';
export class AudioDuration1792796400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE messages ADD COLUMN "audioDuration" double precision NULL',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE messages DROP COLUMN "audioDuration"');
  }
}
