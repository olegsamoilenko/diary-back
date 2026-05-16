import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPlansLastOrderIdIndex1778919000000
  implements MigrationInterface
{
  name = 'FixPlansLastOrderIdIndex1778919000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_plans_last_order_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "plans"
      DROP CONSTRAINT IF EXISTS "uq_plans_last_order_id"
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_plans_last_order_id"
      ON "plans" ("lastOrderId")
      WHERE "lastOrderId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_plans_last_order_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "plans"
      ADD CONSTRAINT "uq_plans_last_order_id"
      UNIQUE ("lastOrderId")
    `);
  }
}
