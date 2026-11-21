import 'dotenv/config';
import { DataSource } from 'typeorm';

const useSsl = process.env.DB_SSL === 'true';
const isCompiled = __dirname.includes('/dist');

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 25060),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  ssl: useSsl ? { rejectUnauthorized: false } : false,

  entities: isCompiled
    ? [__dirname + '/**/*.entity.js', __dirname + '/**/entities/!(*.spec|*.test).js']
    : ['src/**/*.entity.ts', 'src/**/entities/!(*.spec|*.test).ts'],

  migrations: isCompiled
    ? [__dirname + '/migrations/!(*.spec|*.test).js']
    : ['src/migrations/!(*.spec|*.test).ts'],

  synchronize: false,
});
