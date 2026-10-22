// Explicit local PostgreSQL smoke test. Creates and removes only its own disposable database.
require('reflect-metadata');
require('dotenv/config');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { databaseOptions } = require('../dist/database');
const { Product } = require('../dist/entities');
const { NestFactory } = require('@nestjs/core');
const { listenOptions } = require('../dist/listen-options');
async function main() {
  const options = databaseOptions();
  assert.equal(options.type, 'postgres');
  const url = new URL(options.url);
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'This smoke test only accepts a local PostgreSQL server.',
  );
  const name = 'pletosie_startup_' + randomBytes(6).toString('hex');
  assert.match(name, /^pletosie_startup_[0-9a-f]{12}$/);
  const admin = new DataSource({
    ...options,
    entities: [],
    migrations: [],
    migrationsRun: false,
  });
  let created = false,
    db,
    app;
  await admin.initialize();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = '/' + name;
    process.env.DATABASE_URL = url.toString();
    process.env.SEED_DEMO = 'true';
    // No push delivery is enabled in this disposable smoke test.
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { AppModule } = require('../dist/app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, listenOptions({ RENDER: 'true' }).host);
    db = app.get(DataSource);
    const migrations = await db.query(
      'SELECT count(*)::int AS count FROM migrations',
    );
    assert.equal(migrations[0].count, 6);
    assert.equal(await db.getRepository(Product).count(), 8);
    const port = app.getHttpServer().address().port;
    const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.equal(health.status, 200);
    await app.close();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    db = app.get(DataSource);
    assert.equal(await db.getRepository(Product).count(), 8);
    assert.equal(await db.showMigrations(), false);
    console.log(
      'Nest/PostgreSQL OK: 6 migrations on an empty database, 8 demo products, HTTP health 200 on 0.0.0.0, restart without duplicates.',
    );
  } finally {
    if (app) await app.close();
    else if (db?.isInitialized) await db.destroy();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
