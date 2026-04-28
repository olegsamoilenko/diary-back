import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ForumCategory } from '../entities/forum-category.entity';
import { FORUM_CATEGORY_SEED } from './forum-category.seed';

async function run() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.NODE_ENV !== 'development',
    extra:
      process.env.NODE_ENV === 'development'
        ? {}
        : { ssl: { rejectUnauthorized: false } },
    entities: [ForumCategory],
    synchronize: false,
  });

  await dataSource.initialize();

  try {
    const repo = dataSource.getRepository(ForumCategory);

    await repo.upsert(FORUM_CATEGORY_SEED, {
      conflictPaths: ['slug'],
      skipUpdateIfNoValuesChanged: true,
    });

    console.log(`Seeded forum categories: ${FORUM_CATEGORY_SEED.length}`);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error) => {
  console.error('Forum category seed failed:', error);
  process.exit(1);
});
