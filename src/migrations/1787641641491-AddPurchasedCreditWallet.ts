import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchasedCreditWallet1787641641491
  implements MigrationInterface
{
  name = 'AddPurchasedCreditWallet1787641641491';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "credit_wallets" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "balance" integer NOT NULL DEFAULT 0,
        "totalPurchased" integer NOT NULL DEFAULT 0,
        "totalSpent" integer NOT NULL DEFAULT 0,
        "totalRevoked" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_credit_wallets_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_credit_wallets_user_id"
      ON "credit_wallets" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "credit_purchases" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "provider" character varying NOT NULL,
        "productId" character varying NOT NULL,
        "purchaseOptionId" character varying,
        "purchaseToken" text NOT NULL,
        "orderId" character varying,
        "status" character varying NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "creditsGranted" integer NOT NULL,
        "creditsRevoked" integer NOT NULL DEFAULT 0,
        "regionCode" character varying,
        "obfuscatedAccountId" character varying,
        "testPurchase" boolean NOT NULL DEFAULT false,
        "purchasedAt" TIMESTAMP WITH TIME ZONE,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "refundedAt" TIMESTAMP WITH TIME ZONE,
        "rawStoreData" jsonb,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_purchases" PRIMARY KEY ("id"),
        CONSTRAINT "FK_credit_purchases_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_credit_purchases_provider_token"
      ON "credit_purchases" ("provider", "purchaseToken")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_purchases_user_id"
      ON "credit_purchases" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_purchases_product_id"
      ON "credit_purchases" ("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_purchases_order_id"
      ON "credit_purchases" ("orderId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_purchases_status"
      ON "credit_purchases" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "credit_ledger_entries" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "walletId" integer NOT NULL,
        "purchaseId" integer,
        "type" character varying NOT NULL,
        "amount" integer NOT NULL,
        "balanceAfter" integer NOT NULL,
        "idempotencyKey" character varying NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_credit_ledger_entries_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_credit_ledger_entries_wallet" FOREIGN KEY ("walletId")
          REFERENCES "credit_wallets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_credit_ledger_entries_purchase" FOREIGN KEY ("purchaseId")
          REFERENCES "credit_purchases"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_ledger_entries_user_id"
      ON "credit_ledger_entries" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_ledger_entries_wallet_id"
      ON "credit_ledger_entries" ("walletId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_ledger_entries_purchase_id"
      ON "credit_ledger_entries" ("purchaseId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_credit_ledger_entries_type"
      ON "credit_ledger_entries" ("type")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_credit_ledger_entries_idempotency_key"
      ON "credit_ledger_entries" ("idempotencyKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "credit_ledger_entries"`);
    await queryRunner.query(`DROP TABLE "credit_purchases"`);
    await queryRunner.query(`DROP TABLE "credit_wallets"`);
  }
}
