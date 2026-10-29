import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreditPurchaseFinancialDetails1793206800000
  implements MigrationInterface
{
  name = 'AddCreditPurchaseFinancialDetails1793206800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit_purchases"
      ADD COLUMN IF NOT EXISTS "amount" numeric(30,9),
      ADD COLUMN IF NOT EXISTS "currency" varchar(3),
      ADD COLUMN IF NOT EXISTS "financialDetailsPending" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "financialDetailsLastAttemptAt" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit_purchases"
      DROP COLUMN IF EXISTS "financialDetailsLastAttemptAt",
      DROP COLUMN IF EXISTS "financialDetailsPending",
      DROP COLUMN IF EXISTS "currency",
      DROP COLUMN IF EXISTS "amount"`);
  }
}
