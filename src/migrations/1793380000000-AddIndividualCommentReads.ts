import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndividualCommentReads1793380000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE forum_topic_read_states ADD COLUMN IF NOT EXISTS individually_read_comment_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE forum_topic_read_states DROP COLUMN IF EXISTS individually_read_comment_ids',
    );
  }
}
