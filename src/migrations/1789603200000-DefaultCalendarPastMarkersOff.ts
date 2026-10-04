import { MigrationInterface, QueryRunner } from 'typeorm';

/** Change defaults only; preserve every saved user choice. */
export class DefaultCalendarPastMarkersOff1789603200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings"
      ALTER COLUMN "calendarShowEventIconsPast" SET DEFAULT false,
      ALTER COLUMN "calendarShowGoalIconsPast" SET DEFAULT false`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings"
      ALTER COLUMN "calendarShowEventIconsPast" SET DEFAULT true,
      ALTER COLUMN "calendarShowGoalIconsPast" SET DEFAULT true`);
  }
}
