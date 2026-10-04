import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntryMediaAnalysisMode1790187600000
  implements MigrationInterface
{
  name = 'AddEntryMediaAnalysisMode1790187600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "entryMediaAnalysisMode" varchar(16) NOT NULL DEFAULT 'ask'`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "entryMediaAnalysisMode"`,
    );
  }
}
