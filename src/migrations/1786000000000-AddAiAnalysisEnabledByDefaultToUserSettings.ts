import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiAnalysisEnabledByDefaultToUserSettings1786000000000
  implements MigrationInterface
{
  name = 'AddAiAnalysisEnabledByDefaultToUserSettings1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN "aiAnalysisEnabledByDefault" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      DROP COLUMN "aiAnalysisEnabledByDefault"
    `);
  }
}
