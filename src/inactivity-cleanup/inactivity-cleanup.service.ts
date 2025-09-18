import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { EmailsService } from 'src/emails/emails.service';
import { UsersService } from 'src/users/users.service';
import Redis from 'ioredis';
import { Plans, PlanStatus } from 'src/plans/types';
import { Lang } from 'src/users/types';

const NOT_SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.INACTIVE,
  PlanStatus.CANCELED,
  PlanStatus.EXPIRED,
  PlanStatus.REFUNDED,
];

const PAID_PLANS: Plans[] = [Plans.LITE, Plans.BASE, Plans.PRO];

const WARN_AFTER_DAYS = 60;
const DELETE_AFTER_DAYS = 90;
const BATCH_SIZE = 200;

@Injectable()
export class InactivityCleanupService {
  private readonly logger = new Logger(InactivityCleanupService.name);
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly emailsService: EmailsService,
    private readonly usersService: UsersService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  private now() {
    return new Date();
  }
  private daysAgo(n: number) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }

  @Cron('10 3 * * *')
  async runDaily() {
    const lockKey = 'cron:inactive-cleanup:lock';
    const lock = await this.redis.set(lockKey, '1', 'EX', 25 * 60, 'NX');
    if (!lock) {
      this.logger.warn('Skip: another cleanup is running');
      return;
    }

    try {
      await this.sendWarnings();
      await this.deleteExpired();
    } catch (e) {
      this.logger.error('Cleanup failed', e);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async sendWarnings() {
    const warnThreshold = this.daysAgo(WARN_AFTER_DAYS);
    const deleteThreshold = this.daysAgo(DELETE_AFTER_DAYS);

    let lastId = 0;

    while (true) {
      const users = await this.usersRepo
        .createQueryBuilder('u')
        .leftJoinAndSelect('u.plan', 'p')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.email IS NOT NULL')
        .andWhere('u.inactivityWarnedAt IS NULL')
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :warn', { warn: warnThreshold })
        .andWhere('u.lastActiveAt > :del', { del: deleteThreshold })
        .andWhere(
          new Brackets((qb) => {
            qb.where('p.name = :start', { start: Plans.START }) // START — завжди не підписаний
              .orWhere(
                new Brackets((qb2) => {
                  qb2
                    .where('p.name IN (:...paid)', { paid: PAID_PLANS })
                    .andWhere('p.status IN (:...notSub)', {
                      notSub: NOT_SUBSCRIBED_STATUSES,
                    });
                }),
              )
              .orWhere('p.id IS NULL');
          }),
        )
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .select(['u.id', 'u.email', 'u.lastActiveAt', 'u.inactivityWarnedAt'])
        .getMany();

      if (users.length === 0) break;
      lastId = users[users.length - 1].id;

      for (const u of users) {
        const fresh = await this.usersRepo.findOne({
          where: { id: u.id },
          relations: ['plan', 'settings'],
          select: ['id', 'email', 'lastActiveAt', 'inactivityWarnedAt'],
        });
        if (!fresh) continue;
        if (!fresh.email) continue;
        if (!fresh.lastActiveAt || fresh.lastActiveAt > warnThreshold) continue;
        if (fresh.inactivityWarnedAt) continue;
        if (!this.isNotSubscribed(fresh)) continue;

        const scheduledDeletionAt = new Date(
          fresh.lastActiveAt.getTime() + DELETE_AFTER_DAYS * 86400000,
        );

        await this.usersRepo.update(fresh.id, {
          inactivityWarnedAt: this.now(),
          scheduledDeletionAt,
        } as any);

        try {
          const lang = fresh.settings.lang || Lang.EN;
          await this.emailsService.send(
            [fresh.email],
            lang === Lang.EN
              ? 'Account deletion'
              : 'Видалення облікового запису',
            lang === Lang.EN
              ? '/auth/warning-account-delete-en'
              : '/auth/warning-account-delete-uk',
            {
              scheduledDeletionAt: scheduledDeletionAt
                .toISOString()
                .slice(0, 10),
            },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `Failed to send warn mail to ${fresh.email}: ${msg}`,
          );
        }
      }
    }
  }

  private async deleteExpired() {
    const deleteThreshold = this.daysAgo(DELETE_AFTER_DAYS);

    let lastId = 0;
    while (true) {
      const users = await this.usersRepo
        .createQueryBuilder('u')
        .leftJoinAndSelect('u.plan', 'p')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :del', { del: deleteThreshold })
        .andWhere(
          new Brackets((qb) => {
            qb.where('p.name = :start', { start: Plans.START })
              .orWhere(
                new Brackets((qb2) => {
                  qb2
                    .where('p.name IN (:...paid)', { paid: PAID_PLANS })
                    .andWhere('p.status IN (:...notSub)', {
                      notSub: NOT_SUBSCRIBED_STATUSES,
                    });
                }),
              )
              .orWhere('p.id IS NULL');
          }),
        )
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .select(['u.id', 'u.email', 'u.lastActiveAt'])
        .getMany();

      if (users.length === 0) break;
      lastId = users[users.length - 1].id;

      for (const u of users) {
        try {
          const fresh = await this.usersRepo.findOne({
            where: { id: u.id },
            relations: ['plan', 'settings'],
          });
          if (!fresh) continue;
          if (!fresh.lastActiveAt || fresh.lastActiveAt > deleteThreshold)
            continue;
          if (!this.isNotSubscribed(fresh)) continue;

          const hadEmail = !!fresh.email;

          await this.usersService.deleteUser(fresh.id);

          if (hadEmail) {
            try {
              const lang = fresh.settings.lang || Lang.EN;
              await this.emailsService.send(
                [fresh.email as string],
                lang === Lang.EN
                  ? 'Account deleted'
                  : 'обліковий запис видалено',
                lang === Lang.EN
                  ? '/auth/account-deleted-en'
                  : '/auth/account-deleted-uk',
              );
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.logger.warn(
                `Failed to send del mail to ${fresh.email}: ${msg}`,
              );
            }
          }
        } catch (e) {
          this.logger.error(`Delete failed for user ${u.id}`, e);
        }
      }
    }
  }

  private isNotSubscribed(u: {
    plan?: { name?: Plans; status?: PlanStatus } | null;
  }): boolean {
    const p = u.plan;
    if (!p) return true;
    if (p.name === Plans.START) return true;
    if ([Plans.LITE, Plans.BASE, Plans.PRO].includes(p.name as Plans)) {
      return NOT_SUBSCRIBED_STATUSES.includes(p.status as PlanStatus);
    }
    return false;
  }
}
