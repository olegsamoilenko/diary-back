import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountThemeSelection1792695600000
  implements MigrationInterface
{
  name = 'AddAccountThemeSelection1792695600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "themeSelection" jsonb DEFAULT NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "themeSelection"',
    );
  }
}
