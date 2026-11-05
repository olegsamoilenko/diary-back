import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateWebSearchCredits1793865600000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE token_usage_history
      ADD COLUMN IF NOT EXISTS "webSearchCredits" integer NOT NULL DEFAULT 0`);
    // Historical fee was 100 credits/call inside inputCredits. Keep totalCredits
    // and every wallet/plan untouched. Guards also support synchronize adding
    // the column and the new writer running before this migration is applied.
    await queryRunner.query(`UPDATE token_usage_history
      SET "inputCredits" = "inputCredits" - "webSearchCalls" * 100,
          "webSearchCredits" = "webSearchCalls" * 100
      WHERE operation = 'web_search'
        AND "webSearchCalls" > 0
        AND "webSearchCredits" = 0
        AND "inputCredits" >= "webSearchCalls" * 100
        AND "totalCredits" = "inputCredits" + "outputCredits"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE token_usage_history
      SET "inputCredits" = "inputCredits" + "webSearchCredits"
      WHERE "webSearchCredits" > 0`);
    await queryRunner.query(`ALTER TABLE token_usage_history
      DROP COLUMN "webSearchCredits"`);
  }
}
