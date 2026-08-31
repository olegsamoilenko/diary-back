import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarDisplaySettingsToUserSettings1787731200000
  implements MigrationInterface
{
  name = 'AddCalendarDisplaySettingsToUserSettings1787731200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN "calendarShowEventIcons" boolean NOT NULL DEFAULT true,
      ADD COLUMN "calendarShowGoalIcons" boolean NOT NULL DEFAULT true,
      ADD COLUMN "calendarShowMood" boolean NOT NULL DEFAULT true,
      ADD COLUMN "calendarShowEventIconsPast" boolean NOT NULL DEFAULT true,
      ADD COLUMN "calendarShowGoalIconsPast" boolean NOT NULL DEFAULT true,
      ADD COLUMN "calendarEventIconsFutureRange" character varying(32) NOT NULL DEFAULT 'all',
      ADD COLUMN "calendarGoalIconsFutureRange" character varying(32) NOT NULL DEFAULT 'all'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      DROP COLUMN "calendarGoalIconsFutureRange",
      DROP COLUMN "calendarEventIconsFutureRange",
      DROP COLUMN "calendarShowGoalIconsPast",
      DROP COLUMN "calendarShowEventIconsPast",
      DROP COLUMN "calendarShowMood",
      DROP COLUMN "calendarShowGoalIcons",
      DROP COLUMN "calendarShowEventIcons"
    `);
  }
}
