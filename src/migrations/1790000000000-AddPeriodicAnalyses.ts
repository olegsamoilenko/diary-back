import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPeriodicAnalyses1790000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS periodic_analyses (
      id uuid PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL, period_start text NOT NULL, period_end text NOT NULL,
      timezone text NOT NULL, source_hash text NOT NULL, model text NOT NULL,
      status text NOT NULL, encrypted_result jsonb, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_periodic_analysis_owner_period ON periodic_analyses (user_id, period_end)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE periodic_analyses');
  }
}
