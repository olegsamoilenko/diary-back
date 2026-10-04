import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

const tables = [
  'entries_stats',
  'dialogs_stats',
  'checkins_stats',
  'checkin_dialogs_stats',
];

/** Also safe after synchronize has already added these nullable columns. */
export class AddDiaryStatAiInput1790208000000 implements MigrationInterface {
  name = 'AddDiaryStatAiInput1790208000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_token_usage_user_trace_operation" ON "token_usage_history" ("userId", "traceId", "operation")',
    );
    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "inputTokens" integer,
        ADD COLUMN IF NOT EXISTS "inputCredits" integer,
        ADD COLUMN IF NOT EXISTS "aiTraceId" varchar(128)`);
      const schema = await queryRunner.getTable(table);
      if (
        !schema?.indices.some(
          (index) =>
            index.columnNames.length === 1 &&
            index.columnNames[0] === 'aiTraceId',
        )
      ) {
        await queryRunner.createIndex(
          table,
          new TableIndex({ columnNames: ['aiTraceId'] }),
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_token_usage_user_trace_operation"',
    );
    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}"
        DROP COLUMN IF EXISTS "inputTokens",
        DROP COLUMN IF EXISTS "inputCredits",
        DROP COLUMN IF EXISTS "aiTraceId"`);
    }
  }
}
