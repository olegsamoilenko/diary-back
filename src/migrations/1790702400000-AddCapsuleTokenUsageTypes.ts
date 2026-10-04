import { MigrationInterface, QueryRunner } from 'typeorm';

const capsuleTypes = [
  'entry_capsule',
  'checkin_capsule',
  'entry_response_capsule',
  'checkin_response_capsule',
  'dialog_capsule',
  'daily_capsule',
];

export class AddCapsuleTokenUsageTypes1790702400000
  implements MigrationInterface
{
  private async existingTypes(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(
      `SELECT unnest(enum_range(NULL::"public"."token_usage_history_type_enum"))::text AS value`,
    )) as { value: string }[];
    return rows.map((row) => row.value);
  }

  private async replaceEnum(queryRunner: QueryRunner, values: string[]) {
    await queryRunner.query(
      'ALTER TYPE "public"."token_usage_history_type_enum" RENAME TO "token_usage_history_type_enum_before_capsules"',
    );
    await queryRunner.query(
      `CREATE TYPE "public"."token_usage_history_type_enum" AS ENUM(${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',')})`,
    );
    await queryRunner.query(
      'ALTER TABLE "token_usage_history" ALTER COLUMN "type" TYPE "public"."token_usage_history_type_enum" USING "type"::text::"public"."token_usage_history_type_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "public"."token_usage_history_type_enum_before_capsules"',
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await this.existingTypes(queryRunner);
    if (capsuleTypes.some((value) => !existing.includes(value))) {
      // Rebuild to permit transactional backfill; ADD VALUE cannot be used
      // in UPDATE until the transaction adding it commits.
      await this.replaceEnum(queryRunner, [
        ...new Set([...existing, ...capsuleTypes]),
      ]);
    }
    await queryRunner.query(`UPDATE "token_usage_history" SET type = 'daily_capsule'
      WHERE type = 'assistant_memory' AND operation = 'generate_daily_analysis_capsule'`);
    await queryRunner.query(`UPDATE "token_usage_history" SET type = 'dialog_capsule'
      WHERE type = 'assistant_memory' AND operation = 'extract_dialog_memory_capsule_v2'`);
    // A trace alone is not enough: match the owner and require an unambiguous
    // source response. Unknown/failed/old traces retain their original label.
    await queryRunner.query(`WITH sources AS (
      SELECT "userId", "traceId",
        min(CASE operation WHEN 'generate_entry_response' THEN 'entry' ELSE 'checkin' END) AS kind
      FROM "token_usage_history"
      WHERE operation IN ('generate_entry_response', 'generate_checkin_response')
        AND "traceId" IS NOT NULL AND "traceId" <> ''
      GROUP BY "userId", "traceId"
      HAVING count(DISTINCT operation) = 1
    )
    UPDATE "token_usage_history" t SET type =
      (s.kind || CASE WHEN t.operation = 'extract_assistant_memory_capsule_v2'
        THEN '_response_capsule' ELSE '_capsule' END)::"public"."token_usage_history_type_enum"
    FROM sources s
    WHERE t."userId" = s."userId" AND t."traceId" = s."traceId"
      AND ((t.type = 'user_memory' AND t.operation IN
        ('extract_user_memory_details_v2', 'extract_user_memory_capsule_v2'))
        OR (t.type = 'assistant_memory' AND t.operation = 'extract_assistant_memory_capsule_v2'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "token_usage_history" SET type = 'user_memory'
      WHERE type::text IN ('entry_capsule', 'checkin_capsule')`);
    await queryRunner.query(`UPDATE "token_usage_history" SET type = 'assistant_memory'
      WHERE type::text IN ('entry_response_capsule', 'checkin_response_capsule', 'dialog_capsule', 'daily_capsule')`);
    const existing = await this.existingTypes(queryRunner);
    await this.replaceEnum(
      queryRunner,
      existing.filter((value) => !capsuleTypes.includes(value)),
    );
  }
}
