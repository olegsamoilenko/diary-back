import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseNotifications1793340000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['payments', 'credit_purchases']) {
      await queryRunner.query(`ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS "purchaseNotificationState" varchar,
        ADD COLUMN IF NOT EXISTS "purchaseNotificationAttemptAt" timestamptz`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS ${table}_purchase_notification_pending_idx
        ON ${table} ("purchaseNotificationAttemptAt", id)
        WHERE "purchaseNotificationState" IN ('pending','sending')`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['payments', 'credit_purchases']) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS ${table}_purchase_notification_pending_idx`,
      );
      await queryRunner.query(`ALTER TABLE ${table}
        DROP COLUMN IF EXISTS "purchaseNotificationState",
        DROP COLUMN IF EXISTS "purchaseNotificationAttemptAt"`);
    }
  }
}
