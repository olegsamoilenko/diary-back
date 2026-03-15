import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserMonitoring } from './entities/user-monitoring.entity';
import { Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { MonitoringType } from './types';
import { DialogsStat } from '../diary-statistics/entities/dialogs-stat.entity';
import { EntriesStat } from '../diary-statistics/entities/entries-stat.entity';

@Injectable()
export class UserMonitoringService {
  constructor(
    @InjectRepository(UserMonitoring)
    private userMonitoringRepository: Repository<UserMonitoring>,
    private usersService: UsersService,
  ) {}
  async addToMonitoring(
    userUuid: string,
    type: MonitoringType,
    description: string,
  ) {
    const user = await this.usersService.findByUUID(userUuid);
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }
    const monitoring = this.userMonitoringRepository.create({
      user,
      type,
      description,
    });
    return await this.userMonitoringRepository.save(monitoring);
  }

  async getAll(type: MonitoringType) {
    const qb = this.userMonitoringRepository
      .createQueryBuilder('monitoring')
      .leftJoinAndSelect('monitoring.user', 'user')
      .leftJoinAndSelect('user.plans', 'plan', 'plan.actual = :actual', {
        actual: true,
      })
      .leftJoinAndSelect('user.settings', 'settings')
      .leftJoinAndSelect('user.payments', 'payments')
      .leftJoinAndSelect('user.goalsStats', 'goalsStats')
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(DialogsStat, 'ds')
          .where('ds.userId = user.id');
      }, 'dialogs_stats_count')
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(EntriesStat, 'es')
          .where('es.userId = user.id');
      }, 'entries_stats_count');

    if (type !== MonitoringType.ALL) {
      qb.where('monitoring.type = :type', { type });
    }

    const { entities, raw } = await qb.getRawAndEntities();

    const countsByUserId = new Map<number, { d: number; e: number }>();

    const typedRaw = raw as Array<{
      user_id: number | string;
      dialogs_stats_count?: number | string | null;
      entries_stats_count?: number | string | null;
    }>;

    for (const r of typedRaw) {
      const userId = Number(r['user_id']);

      if (!countsByUserId.has(userId)) {
        countsByUserId.set(userId, {
          d: Number(r['dialogs_stats_count'] ?? 0),
          e: Number(r['entries_stats_count'] ?? 0),
        });
      }
    }

    return entities.map((item) => {
      const c = countsByUserId.get(item.user?.id) ?? { d: 0, e: 0 };
      const activePlan = item.user?.plans?.[0] ?? null;

      return {
        ...item,
        user: item.user
          ? {
              ...item.user,
              dialogsStatsCount: c.d,
              entriesStatsCount: c.e,
              plan: activePlan,
              plans: undefined,
            }
          : null,
      };
    });
  }

  async deleteFromMonitoring(id: number) {
    await this.userMonitoringRepository.delete(id);
  }
}
