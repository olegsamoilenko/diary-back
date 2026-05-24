import 'dotenv/config';
import { DataSource } from 'typeorm';

const useSsl = process.env.DB_SSL === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 25060),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  ssl: useSsl ? { rejectUnauthorized: false } : false,

  entities: [
    'src/**/*.entity.ts',
    'src/**/entities/*.ts',
    'dist/**/*.entity.js',
    'dist/**/entities/*.js',
  ],

  migrations: ['dist/migrations/*.js'],

  synchronize: false,
});
