import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddCheckinSettings1789066800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "checkinSettings" jsonb NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user_settings" DROP COLUMN "checkinSettings"');
  }
}
