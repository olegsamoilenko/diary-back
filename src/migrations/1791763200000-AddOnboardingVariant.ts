import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingVariant1791763200000 implements MigrationInterface {
  name = 'AddOnboardingVariant1791763200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // No backfill: a server setting today cannot establish a past exposure.
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "onboardingVariant" varchar(32) DEFAULT NULL`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "onboardingVariant"`,
    );
  }
}
