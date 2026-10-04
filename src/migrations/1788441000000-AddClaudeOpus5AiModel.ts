import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClaudeOpus5AiModel1788441000000 implements MigrationInterface {
  name = 'AddClaudeOpus5AiModel1788441000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."token_usage_history_aimodel_enum"
      ADD VALUE IF NOT EXISTS 'claude-opus-5'
    `);
  }

  public down(): Promise<void> {
    // Preserve historical usage and older clients when rolling back app code.
    return Promise.resolve();
  }
}
