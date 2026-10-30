import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushDeviceOwnership1793280000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_push_tokens" ADD COLUMN IF NOT EXISTS "deviceKeyHash" varchar(64)`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "push_device_states" (
      "keyHash" varchar(64) PRIMARY KEY, "publicKey" text NOT NULL,
      "revision" bigint NOT NULL, "requestHash" varchar(64) NOT NULL
    )`);
    // Do not guess the owner of old duplicates: disable all ambiguous rows.
    // The next authenticated registration establishes the current owner.
    await queryRunner.query(`UPDATE user_push_tokens SET is_active = false
      WHERE token IN (SELECT token FROM user_push_tokens WHERE is_active = true
        GROUP BY token HAVING COUNT(DISTINCT user_id) > 1)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_device_states"`);
    await queryRunner.query(
      `ALTER TABLE "user_push_tokens" DROP COLUMN IF EXISTS "deviceKeyHash"`,
    );
  }
}
