import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageGenerationModel1790164800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."token_usage_history_aimodel_enum" ADD VALUE IF NOT EXISTS 'gpt-image-2.5-flare'`,
    );
  }
  public down(): Promise<void> {
    return Promise.resolve();
  }
}
