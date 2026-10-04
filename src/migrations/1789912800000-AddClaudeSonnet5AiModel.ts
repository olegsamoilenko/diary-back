import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClaudeSonnet5AiModel1789912800000
  implements MigrationInterface
{
  name = 'AddClaudeSonnet5AiModel1789912800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."token_usage_history_aimodel_enum"
      ADD VALUE IF NOT EXISTS 'claude-sonnet-5'
    `);
  }

  public down(): Promise<void> {
    // Keep saved usage and all previous model values on application rollback.
    return Promise.resolve();
  }
}
