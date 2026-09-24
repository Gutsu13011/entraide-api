import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ServiceProvider } from '../service-providers/service-provider.entity.js';
import { Review } from '../reviews/review.entity.js';
import { ServiceOffering } from '../service-offerings/service-offering.entity.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH ?? 'entraide.sqlite',
  entities: [ServiceProvider, Review, ServiceOffering],
  migrations: [join(currentDirectory, 'migrations/*{.js,.ts}')],
  synchronize: false,
});
