import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonthlyYearlyCapsuleTokenUsageTypes1790870400000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['monthly_capsule', 'yearly_capsule']) {
      await queryRunner.query(
        `ALTER TYPE "public"."token_usage_history_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  down(): Promise<void> {
    // Preserve historical billing rows on rollback; PostgreSQL cannot drop one enum value.
    return Promise.resolve();
  }
}
