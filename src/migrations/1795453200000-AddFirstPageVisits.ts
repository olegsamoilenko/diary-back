import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirstPageVisits1795453200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "firstPageVisits" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE users DROP COLUMN IF EXISTS "firstPageVisits"',
    );
  }
}
