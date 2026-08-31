import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenRotationGrace1787853600000
  implements MigrationInterface
{
  name = 'AddRefreshTokenRotationGrace1787853600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      ADD COLUMN "refreshTokenHistory" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      DROP COLUMN "refreshTokenHistory"
    `);
  }
}
