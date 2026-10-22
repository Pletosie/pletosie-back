import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { InitialSchema1792368000000 } from './migrations/1792368000000-InitialSchema';
import { Operations1792368000001 } from './migrations/1792368000001-Operations';
import { GoogleAuth1792368000002 } from './migrations/1792368000002-GoogleAuth';
import { WebPush1792627200000 } from './migrations/1792627200000-WebPush';
import { ClassicSizes1792713600000 } from './migrations/1792713600000-ClassicSizes';
export function databaseOptions(): DataSourceOptions {
  if (process.env.DATABASE_URL)
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities,
      synchronize: false,
      migrations: [
        InitialSchema1792368000000,
        Operations1792368000001,
        GoogleAuth1792368000002,
        WebPush1792627200000,
        ClassicSizes1792713600000,
      ],
      migrationsRun: false,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: true }
          : false,
    };
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL PostgreSQL est obligatoire en production.');
  return {
    type: 'sqljs',
    location: process.env.LOCAL_DB_FILE || 'work/pletosie.sqlite',
    autoSave: true,
    entities,
    synchronize: true,
  };
}
export default new DataSource(databaseOptions());
