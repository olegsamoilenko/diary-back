import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiMediaAssets1790001000000 implements MigrationInterface {
  name = 'AddAiMediaAssets1790001000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."token_usage_history_aimodel_enum" ADD VALUE IF NOT EXISTS 'gpt-4o-mini-transcribe'`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "ai_media_assets" (
      "id" uuid PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "hash" text NOT NULL,
      "metadata" jsonb NOT NULL,
      "status" text NOT NULL,
      "encrypted_payload" jsonb NOT NULL,
      "used_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_media_owner_created" ON "ai_media_assets" ("user_id", "created_at")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_media_assets"`);
    // Keep the enum value so historical usage remains readable on rollback.
  }
}
