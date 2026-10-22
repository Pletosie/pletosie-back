import { MigrationInterface, QueryRunner } from 'typeorm';
export class ClassicSizes1792713600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const rows: { id: string; variants: { size: string }[] }[] = await q.query(
      'SELECT id, variants FROM products',
    );
    for (const row of rows) {
      let changed = false;
      const source: { size: string }[] =
        typeof row.variants === 'string'
          ? JSON.parse(row.variants)
          : row.variants;
      const variants = source.map((v) => {
        const size: Record<string, string> = { P1: 'S', P2: 'M', P3: 'L' };
        if (size[v.size]) {
          changed = true;
          return { ...v, size: size[v.size] };
        }
        return v;
      });
      if (changed)
        await q.query('UPDATE products SET variants=$1 WHERE id=$2', [
          JSON.stringify(variants),
          row.id,
        ]);
    }
  }
  async down(): Promise<void> {
    /* Labels stay standard; order snapshots and variant IDs are preserved. */
  }
}
