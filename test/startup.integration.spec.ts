import { databaseOptions } from '../src/database';
import { listenOptions } from '../src/listen-options';
describe('Configuration du démarrage Render', () => {
  it('applique les migrations PostgreSQL avant les hooks Nest sans synchronisation automatique', () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
    try {
      const options = databaseOptions();
      expect(options.type).toBe('postgres');
      expect(options.migrationsRun).toBe(true);
      expect(options.synchronize).toBe(false);
      expect((options.migrations as unknown[]).length).toBe(6);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
  it('écoute le PORT fourni sur toutes les interfaces Render malgré un HOST local', () => {
    expect(
      listenOptions({ RENDER: 'true', PORT: '10000', HOST: '127.0.0.1' }),
    ).toEqual({ host: '0.0.0.0', port: 10000 });
  });
  it('conserve les réglages locaux et valide le port', () => {
    expect(listenOptions({})).toEqual({ host: '127.0.0.1', port: 4000 });
    expect(listenOptions({ NODE_ENV: 'production' }).host).toBe('0.0.0.0');
    expect(() => listenOptions({ PORT: 'invalid' })).toThrow('PORT');
  });
});
