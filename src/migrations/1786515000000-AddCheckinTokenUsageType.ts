import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckinTokenUsageType1786515000000
  implements MigrationInterface
{
  name = 'AddCheckinTokenUsageType1786515000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."token_usage_history_type_enum"
      RENAME TO "token_usage_history_type_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."token_usage_history_type_enum" AS ENUM(
        'entry',
        'checkin',
        'dialog',
        'embedding',
        'user_memory',
        'assistant_memory'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "token_usage_history"
      ALTER COLUMN "type" TYPE "public"."token_usage_history_type_enum"
      USING "type"::text::"public"."token_usage_history_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."token_usage_history_type_enum_old"
    `);

    await queryRunner.query(`
      UPDATE "token_usage_history"
      SET "type" = 'checkin'
      WHERE "type" = 'entry'
        AND "operation" = 'generate_checkin_response'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "token_usage_history"
      SET "type" = 'entry'
      WHERE "type" = 'checkin'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."token_usage_history_type_enum"
      RENAME TO "token_usage_history_type_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."token_usage_history_type_enum" AS ENUM(
        'entry',
        'dialog',
        'embedding',
        'user_memory',
        'assistant_memory'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "token_usage_history"
      ALTER COLUMN "type" TYPE "public"."token_usage_history_type_enum"
      USING "type"::text::"public"."token_usage_history_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."token_usage_history_type_enum_old"
    `);
  }
}
