import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlannerCreationStats1792195200000
  implements MigrationInterface
{
  name = 'AddPlannerCreationStats1792195200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "planner_creation_stats" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer,
        "type" varchar(16) NOT NULL,
        "entity_id" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_planner_creation_source" UNIQUE ("user_id", "type", "entity_id"),
        CONSTRAINT "FK_planner_creation_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_planner_creation_type_date"
      ON "planner_creation_stats" ("type", "created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "planner_creation_stats"');
  }
}
