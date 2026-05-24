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
    ? [__dirname + '/**/*.entity.js', __dirname + '/**/entities/*.js']
    : ['src/**/*.entity.ts', 'src/**/entities/*.ts'],

  migrations: isCompiled
    ? [__dirname + '/migrations/*.js']
    : ['src/migrations/*.ts'],

  synchronize: false,
});
