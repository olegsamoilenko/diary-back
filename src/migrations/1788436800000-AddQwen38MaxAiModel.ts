import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQwen38MaxAiModel1788436800000 implements MigrationInterface {
  name = 'AddQwen38MaxAiModel1788436800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."token_usage_history_aimodel_enum"
      ADD VALUE IF NOT EXISTS 'qwen3.8-max'
    `);
  }

  public down(): Promise<void> {
    // Keep the additive enum value so a rollback preserves historical usage.
    // PostgreSQL cannot drop an enum value without rebuilding the type.
    return Promise.resolve();
  }
}
