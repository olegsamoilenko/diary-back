import { MigrationInterface, QueryRunner } from 'typeorm';

/** Explicit privacy migration. Deploy the local-context client/backend together.
 * No backup/copy of private payloads is created; device reports are unaffected.
 */
export class RemoveServerPeriodicAnalyses1790712000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "public"."periodic_analyses"',
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Privacy deletion is irreversible; server report storage must not be restored.',
      ),
    );
  }
}
