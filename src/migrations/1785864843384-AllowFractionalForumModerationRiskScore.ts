import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowFractionalForumModerationRiskScore1785864843384
  implements MigrationInterface
{
  name = 'AllowFractionalForumModerationRiskScore1785864843384';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "forum_content_moderation_logs"
      ALTER COLUMN "risk_score" TYPE real
      USING "risk_score"::real
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "forum_content_moderation_logs"
      ALTER COLUMN "risk_score" TYPE integer
      USING ROUND("risk_score")::integer
    `);
  }
}
