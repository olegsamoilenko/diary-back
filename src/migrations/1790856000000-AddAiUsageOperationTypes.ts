import { MigrationInterface, QueryRunner } from 'typeorm';

const newTypes = [
  'nemory_actions',
  'conversation',
  'entry_dialog',
  'checkin_dialog',
  'daily_analysis_dialog',
  'weekly_analysis_dialog',
  'monthly_analysis_dialog',
  'yearly_analysis_dialog',
  'periodic_analysis_dialog',
];

export class AddAiUsageOperationTypes1790856000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT unnest(enum_range(NULL::"public"."token_usage_history_type_enum"))::text AS value`,
    )) as { value: string }[];
    const existing = rows.map((row) => row.value);
    if (newTypes.some((value) => !existing.includes(value))) {
      // Rebuild like the capsule migration: new enum values must be usable in
      // the same transaction as the exact-operation historical backfill.
      const values = [...new Set([...existing, ...newTypes])];
      await queryRunner.query(
        'ALTER TYPE "public"."token_usage_history_type_enum" RENAME TO "token_usage_history_type_enum_before_operations"',
      );
      await queryRunner.query(
        `CREATE TYPE "public"."token_usage_history_type_enum" AS ENUM(${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',')})`,
      );
      await queryRunner.query(
        'ALTER TABLE "token_usage_history" ALTER COLUMN "type" TYPE "public"."token_usage_history_type_enum" USING "type"::text::"public"."token_usage_history_type_enum"',
      );
      await queryRunner.query(
        'DROP TYPE "public"."token_usage_history_type_enum_before_operations"',
      );
    }
    // No content/model/date guesses: the old periodic operation has no period.
    await queryRunner.query(`UPDATE "token_usage_history" SET type =
      (CASE operation
        WHEN 'generate_conversation_response' THEN 'conversation'
        WHEN 'generate_dialog_response' THEN 'entry_dialog'
        WHEN 'generate_checkin_dialog_response' THEN 'checkin_dialog'
        WHEN 'generate_periodic_analysis_dialog_response' THEN 'periodic_analysis_dialog'
      END)::"public"."token_usage_history_type_enum"
      WHERE type::text = 'dialog' AND operation IN (
        'generate_conversation_response', 'generate_dialog_response',
        'generate_checkin_dialog_response', 'generate_periodic_analysis_dialog_response')`);
    // Historical capsule rows cannot distinguish actionsOnly from compression.
  }

  down(queryRunner: QueryRunner): Promise<void> {
    // Preserve historical classifications/charges; PostgreSQL cannot safely
    // remove individual enum values. Roll back callers without rewriting usage.
    void queryRunner;
    return Promise.resolve();
  }
}
