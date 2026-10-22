import { QueryRunner } from 'typeorm';
import { ClassicSizes1792713600000 } from '../src/migrations/1792713600000-ClassicSizes';
describe('Classic size migration', () => {
  it('reads simple-json text and changes only labels, preserving variant IDs, stocks and prices', async () => {
    const original = [
      { id: 'robe-0-0', size: 'P1', stock: 3, price: 18500 },
      { id: 'robe-0-1', size: 'P2', stock: 0, price: 19000 },
      { id: 'robe-0-2', size: 'P3', stock: 1, price: 18500 },
    ];
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'p', variants: JSON.stringify(original) }])
      .mockResolvedValue([]);
    await new ClassicSizes1792713600000().up({
      query,
    } as unknown as QueryRunner);
    expect(query.mock.calls[1][0]).toBe(
      'UPDATE products SET variants=$1 WHERE id=$2',
    );
    expect(JSON.parse(query.mock.calls[1][1][0])).toEqual(
      original.map((v, i) => ({ ...v, size: ['S', 'M', 'L'][i] })),
    );
  });
  it('leaves existing standard sizes untouched on a repeat run', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { id: 'p', variants: [{ size: 'XS' }, { size: 'S' }, { size: 'XXL' }] },
      ]);
    await new ClassicSizes1792713600000().up({
      query,
    } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
