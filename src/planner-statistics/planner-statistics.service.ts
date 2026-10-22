import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlannerCreationStat } from './entities/planner-creation-stat.entity';
import { PLANNER_TYPES, PlannerType } from './planner-statistics.dto';

@Injectable()
export class PlannerStatisticsService {
  constructor(
    @InjectRepository(PlannerCreationStat)
    private readonly repository: Repository<PlannerCreationStat>,
  ) {}

  async recordCreation(userId: number, type: PlannerType, entityId?: string) {
    if (!PLANNER_TYPES.includes(type)) {
      throw new BadRequestException('Unknown planner type');
    }
    const rows: unknown[] = await this.repository.query(
      `INSERT INTO planner_creation_stats (user_id, type, entity_id, created_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, type, entity_id) DO UPDATE
       SET created_at = EXCLUDED.created_at
       WHERE planner_creation_stats.created_at IS NULL
       RETURNING id`,
      [userId, type, entityId ?? null],
    );
    // A late creation report must not resurrect an already deleted item.
    return { recorded: rows.length > 0 };
  }

  /** An edited occurrence can become another saved card, without a new Create action. */
  async recordSaved(userId: number, type: PlannerType, entityId: string) {
    const rows: unknown[] = await this.repository.query(
      `INSERT INTO planner_creation_stats (user_id, type, entity_id, created_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id, type, entity_id) DO NOTHING RETURNING id`,
      [userId, type, entityId],
    );
    return { recorded: rows.length > 0 };
  }

  async recordDeletion(userId: number, type: PlannerType, entityId: string) {
    await this.repository.query(
      `INSERT INTO planner_creation_stats (user_id, type, entity_id, created_at, deleted_at)
       VALUES ($1, $2, $3, NULL, now())
       ON CONFLICT (user_id, type, entity_id) DO UPDATE
       SET deleted_at = COALESCE(planner_creation_stats.deleted_at, EXCLUDED.deleted_at)`,
      [userId, type, entityId],
    );
    return { recorded: true };
  }

  /** Old clients have no source ID: retain their former last-of-type semantics. */
  async recordLegacyDeletion(userId: number, type: PlannerType) {
    await this.repository.query(
      `UPDATE planner_creation_stats SET deleted_at = now()
       WHERE id = (SELECT id FROM planner_creation_stats
         WHERE user_id = $1 AND type = $2 AND entity_id IS NULL AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1 FOR UPDATE SKIP LOCKED)`,
      [userId, type],
    );
  }
}
