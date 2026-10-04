import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeeklyCapsuleTokenUsageType1790769600000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."token_usage_history_type_enum" ADD VALUE IF NOT EXISTS 'weekly_capsule'`,
    );
  }

  down(queryRunner: QueryRunner): Promise<void> {
    // Keep the enum value to preserve historical billing rows on code rollback.
    // PostgreSQL does not support dropping an individual enum value safely.
    void queryRunner;
    return Promise.resolve();
  }
}
