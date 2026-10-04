import { MigrationInterface, QueryRunner } from 'typeorm';

const legacy = [
  'entry',
  'checkin',
  'dialog',
  'embedding',
  'user_memory',
  'assistant_memory',
];
const periodic = [
  'daily_analysis',
  'weekly_analysis',
  'monthly_analysis',
  'yearly_analysis',
];

export class AddPeriodicTokenUsageTypes1790683200000
  implements MigrationInterface
{
  private async replaceEnum(queryRunner: QueryRunner, values: string[]) {
    await queryRunner.query(
      'ALTER TYPE "public"."token_usage_history_type_enum" RENAME TO "token_usage_history_type_enum_before_periodic"',
    );
    await queryRunner.query(
      `CREATE TYPE "public"."token_usage_history_type_enum" AS ENUM(${values.map((value) => `'${value}'`).join(',')})`,
    );
    await queryRunner.query(
      'ALTER TABLE "token_usage_history" ALTER COLUMN "type" TYPE "public"."token_usage_history_type_enum" USING "type"::text::"public"."token_usage_history_type_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "public"."token_usage_history_type_enum_before_periodic"',
    );
  }
  async up(queryRunner: QueryRunner): Promise<void> {
    // Development synchronize may have already added newer usage types.
    const existing = (await queryRunner.query(
      `SELECT unnest(enum_range(NULL::"public"."token_usage_history_type_enum"))::text AS value`,
    )) as { value: string }[];
    await this.replaceEnum(queryRunner, [
      ...new Set([...legacy, ...periodic, ...existing.map((row) => row.value)]),
    ]);
    // Reclassify only verified report traces, never infer from a model or date.
    await queryRunner.query(`UPDATE "token_usage_history" t SET "type" =
      (CASE p.kind WHEN 'day' THEN 'daily_analysis' WHEN 'week' THEN 'weekly_analysis'
       WHEN 'month' THEN 'monthly_analysis' WHEN 'year' THEN 'yearly_analysis' END)::"public"."token_usage_history_type_enum"
      FROM "periodic_analyses" p
      WHERE t."traceId" = p.id::text AND t."userId" = p.user_id
        AND t.type = 'entry' AND t.operation = 'generate_periodic_analysis_response'
        AND p.kind IN ('day', 'week', 'month', 'year')`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "token_usage_history" SET type = 'entry' WHERE type::text IN (${periodic.map((value) => `'${value}'`).join(',')})`,
    );
    await this.replaceEnum(queryRunner, legacy);
  }
}
