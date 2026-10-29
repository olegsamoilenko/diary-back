import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentRevenueAndTax1793211600000
  implements MigrationInterface
{
  name = 'AddPaymentRevenueAndTax1793211600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE credit_purchases
      ADD COLUMN IF NOT EXISTS "developerRevenue" numeric(30,9),
      ADD COLUMN IF NOT EXISTS "taxAmount" numeric(30,9)`);
    await q.query(`ALTER TABLE payments
      ALTER COLUMN amount TYPE numeric(30,9), ALTER COLUMN amount DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS "developerRevenue" numeric(30,9),
      ADD COLUMN IF NOT EXISTS "taxAmount" numeric(30,9),
      ADD COLUMN IF NOT EXISTS "basePlanId" varchar,
      ADD COLUMN IF NOT EXISTS "productId" varchar,
      ADD COLUMN IF NOT EXISTS "packageName" varchar,
      ADD COLUMN IF NOT EXISTS "testPurchase" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "orderState" varchar,
      ADD COLUMN IF NOT EXISTS "financialDetailsPending" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "financialDetailsLastAttemptAt" timestamptz`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Abort rollback if new pending receipts would lose the distinction unknown/zero.
    await q.query('ALTER TABLE payments ALTER COLUMN amount SET NOT NULL');
    await q.query(`ALTER TABLE payments
      DROP COLUMN "developerRevenue", DROP COLUMN "taxAmount", DROP COLUMN "basePlanId",
      DROP COLUMN "productId", DROP COLUMN "packageName", DROP COLUMN "testPurchase",
      DROP COLUMN "orderState", DROP COLUMN "financialDetailsPending", DROP COLUMN "financialDetailsLastAttemptAt"`);
    await q.query(
      'ALTER TABLE credit_purchases DROP COLUMN "developerRevenue", DROP COLUMN "taxAmount"',
    );
  }
}
