import { MigrationInterface, QueryRunner } from 'typeorm';

/** Creation-time association only; historical rows remain unknown/null. */
export class AddEntryStatPlannerType1792216800000
  implements MigrationInterface
{
  name = 'AddEntryStatPlannerType1792216800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "entries_stats" ADD COLUMN IF NOT EXISTS "hasAiAnalysis" boolean NULL',
    );
    await queryRunner.query(`ALTER TABLE "entries_stats"
      ADD COLUMN IF NOT EXISTS "plannerType" varchar(16) NULL`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_entries_stats_planner_type'
        AND conrelid = 'entries_stats'::regclass) THEN
        ALTER TABLE "entries_stats" ADD CONSTRAINT "CHK_entries_stats_planner_type"
          CHECK ("plannerType" IN ('goal', 'habit', 'task', 'event'));
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "entries_stats" DROP COLUMN "hasAiAnalysis"',
    );
    await queryRunner.query(
      'ALTER TABLE "entries_stats" DROP COLUMN "plannerType"',
    );
  }
}
