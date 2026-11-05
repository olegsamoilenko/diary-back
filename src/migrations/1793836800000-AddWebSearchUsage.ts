import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebSearchUsage1793836800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE token_usage_history
      ADD COLUMN IF NOT EXISTS "webSearchCalls" integer NOT NULL DEFAULT 0`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE token_usage_history
      DROP COLUMN IF EXISTS "webSearchCalls"`);
  }
}
