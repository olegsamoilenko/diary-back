import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiMediaReplayExpiry1791200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ai_media_assets" ADD COLUMN "expires_at" timestamptz NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_ai_media_expiry" ON "ai_media_assets" ("expires_at") WHERE "expires_at" IS NOT NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_ai_media_expiry"');
    await queryRunner.query(
      'ALTER TABLE "ai_media_assets" DROP COLUMN "expires_at"',
    );
  }
}
