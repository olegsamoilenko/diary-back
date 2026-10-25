import { MigrationInterface, QueryRunner } from 'typeorm';

/** Old clients and historical check-ins retain an unknown analysis status. */
export class AddCheckinStatAnalysis1792670400000 implements MigrationInterface {
  name = 'AddCheckinStatAnalysis1792670400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "checkins_stats" ADD COLUMN IF NOT EXISTS "hasAiAnalysis" boolean NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "checkins_stats" DROP COLUMN "hasAiAnalysis"',
    );
  }
}
