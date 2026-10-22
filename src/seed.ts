import { DataSource } from 'typeorm';
import { Product, User } from './entities';
import { randomUUID } from 'crypto';
export async function seed(db: DataSource) {
  if (
    process.env.SEED_DEMO === 'true' &&
    !(await db.getRepository(Product).count())
  ) {
    const data = [
      [
        'robe-amara',
        'Robe Amara',
        'Robes',
        18500,
        'robe',
        'Terracotta',
        '#b57552',
      ],
      [
        'ensemble-naya',
        'Ensemble Naya',
        'Ensembles',
        28000,
        'ensemble',
        'Sauge',
        '#8b967f',
      ],
      ['blouse-aya', 'Blouse Aya', 'Hauts', 12500, 'haut', 'Écru', '#e8decd'],
      ['jupe-sira', 'Jupe Sira', 'Jupes', 15000, 'jupe', 'Bordeaux', '#763345'],
      ['robe-adja', 'Robe Adja', 'Robes', 22000, 'robe', 'Bordeaux', '#763345'],
      [
        'ensemble-lina',
        'Ensemble Lina',
        'Ensembles',
        32000,
        'ensemble',
        'Terracotta',
        '#b57552',
      ],
      ['haut-nola', 'Haut Nola', 'Hauts', 10000, 'haut', 'Sauge', '#8b967f'],
      ['jupe-eden', 'Jupe Eden', 'Jupes', 16500, 'jupe', 'Écru', '#e8decd'],
    ] as const;
    for (const [slug, name, category, price, shape, color, hex] of data) {
      const id = randomUUID();
      const variants = [color, 'Noir'].flatMap((c, ci) =>
        ['S', 'M', 'L', 'XS', 'XL', 'XXL'].map((size, i) => ({
          id: `${slug}-${ci}-${i}`,
          color: c,
          hex: ci ? '#30302d' : hex,
          size,
          stock: 5,
          price,
          image: `/pieces/${shape}-${
            ci
              ? 'noir'
              : color
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
          }.svg`,
        })),
      );
      await db.getRepository(Product).save({
        id,
        slug,
        name,
        category,
        price,
        image: variants[0].image,
        published: true,
        madeToOrder: false,
        description:
          'Une pièce de démonstration imaginée pour présenter le savoir-faire de l’atelier. La coupe et les détails seront renseignés avec la collection définitive.',
        material: 'Matière à préciser par la créatrice',
        care: 'Instructions d’entretien à confirmer',
        variants,
      });
    }
  }
}
