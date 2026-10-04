import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddMetricTrackingToUserSettings1789027200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" ADD COLUMN "metricTracking" jsonb NULL',
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_settings" DROP COLUMN "metricTracking"',
    );
  }
}
