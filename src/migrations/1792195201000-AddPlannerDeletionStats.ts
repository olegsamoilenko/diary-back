import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlannerDeletionStats1792195201000
  implements MigrationInterface
{
  name = 'AddPlannerDeletionStats1792195201000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "planner_creation_stats" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz',
    );
    await queryRunner.query(
      'ALTER TABLE "planner_creation_stats" ALTER COLUMN "created_at" DROP NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rows without a creation represent technical branches or early deletes,
    // not historical Create actions; never fabricate a timestamp for them.
    await queryRunner.query(
      'DELETE FROM "planner_creation_stats" WHERE "created_at" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "planner_creation_stats" ALTER COLUMN "created_at" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "planner_creation_stats" DROP COLUMN IF EXISTS "deleted_at"',
    );
  }
}
