import { MigrationInterface, QueryRunner } from 'typeorm';

const tables = [
  ['entries_stats', 'user_id'],
  ['dialogs_stats', 'userId'],
  ['checkins_stats', 'user_id'],
  ['checkin_dialogs_stats', 'user_id'],
] as const;

/** Local source IDs do not require a parent statistics event to arrive first. */
export class AddDiaryStatEntryId1790208001000 implements MigrationInterface {
  name = 'AddDiaryStatEntryId1790208001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, owner] of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "entryId" varchar(128)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_user_entry" ON "${table}" ("${owner}", "entryId")`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table] of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_user_entry"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "entryId"`,
      );
    }
  }
}
