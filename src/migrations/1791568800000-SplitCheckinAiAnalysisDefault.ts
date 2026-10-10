import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitCheckinAiAnalysisDefault1791568800000
  implements MigrationInterface
{
  name = 'SplitCheckinAiAnalysisDefault1791568800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safe when TypeORM synchronize has already introduced the nullable field.
    await queryRunner.query(`ALTER TABLE "user_settings"
      ADD COLUMN IF NOT EXISTS "checkinAiAnalysisEnabledByDefault" boolean DEFAULT NULL`);
    await queryRunner.query(`UPDATE "user_settings"
      SET "checkinAiAnalysisEnabledByDefault" = "aiAnalysisEnabledByDefault"
      WHERE "checkinAiAnalysisEnabledByDefault" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings"
      DROP COLUMN IF EXISTS "checkinAiAnalysisEnabledByDefault"`);
  }
}
