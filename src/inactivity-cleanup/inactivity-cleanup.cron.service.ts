import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { EmailsService } from 'src/emails/emails.service';
import { UsersService } from 'src/users/users.service';
import Redis from 'ioredis';
import { Lang } from 'src/users/types';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

const PAID_SOURCES: SubscriptionSource[] = [
  SubscriptionSource.GOOGLE_PLAY,
  SubscriptionSource.APP_STORE,
];

const WARN_AFTER_DAYS = 150;
const DELETE_AFTER_DAYS = 180;
const BATCH_SIZE = 200;

@Injectable()
export class InactivityCleanupCronService {
  private readonly logger = new Logger(InactivityCleanupCronService.name);
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(UserPlanState)
    private readonly userPlanStatesRepo: Repository<UserPlanState>,
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

  @Cron('10 3 * * *', { timeZone: 'Europe/Kyiv' })
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

    this.logger.log(
      `Starting users warning. Warning users with ts < ${warnThreshold.toISOString()}`,
    );

    let lastId = 0;

    while (true) {
      const users = await this.usersRepo
        .createQueryBuilder('u')
        .leftJoin(UserPlanState, 's', 's.userId = u.id')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.email IS NOT NULL')
        .andWhere('u.inactivityWarnedAt IS NULL')
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :warn', { warn: warnThreshold })
        .andWhere('u.lastActiveAt > :del', { del: deleteThreshold })
        .andWhere(this.notSubscribedCondition('s'))
        .setParameters(this.notSubscribedParams())
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .select(['u.id', 'u.email', 'u.lastActiveAt', 'u.inactivityWarnedAt'])
        .getMany();

      if (users.length === 0) break;
      lastId = users[users.length - 1].id;

      let warnedCount = 0;

      for (const u of users) {
        const fresh = await this.usersRepo.findOne({
          where: { id: u.id },
          relations: ['settings'],
          select: ['id', 'email', 'lastActiveAt', 'inactivityWarnedAt'],
        });
        if (!fresh) continue;
        if (!fresh.email) continue;
        if (!fresh.lastActiveAt || fresh.lastActiveAt > warnThreshold) continue;
        if (fresh.inactivityWarnedAt) continue;
        if (!(await this.isUserNotSubscribed(fresh.id))) continue;

        const scheduledDeletionAt = new Date(
          fresh.lastActiveAt.getTime() + DELETE_AFTER_DAYS * 86400000,
        );

        await this.usersRepo.update(fresh.id, {
          inactivityWarnedAt: this.now(),
          scheduledDeletionAt,
        });

        try {
          const lang = fresh.settings.lang ?? Lang.EN;
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
          warnedCount++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `Failed to send warn mail to ${fresh.email}: ${msg}`,
          );
        }
      }

      this.logger.log(`Sent ${warnedCount} warnings`);
    }
  }

  private async deleteExpired() {
    const deleteThreshold = this.daysAgo(DELETE_AFTER_DAYS);

    this.logger.log(
      `Starting users cleanup. Deleting users with ts < ${deleteThreshold.toISOString()}`,
    );

    let lastId = 0;
    while (true) {
      const users = await this.usersRepo
        .createQueryBuilder('u')
        .leftJoin(UserPlanState, 's', 's.userId = u.id')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :del', { del: deleteThreshold })
        .andWhere(this.notSubscribedCondition('s'))
        .setParameters(this.notSubscribedParams())
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .select(['u.id', 'u.email', 'u.lastActiveAt'])
        .getMany();

      if (users.length === 0) break;
      lastId = users[users.length - 1].id;

      let deletedCount = 0;

      for (const u of users) {
        try {
          const fresh = await this.usersRepo.findOne({
            where: { id: u.id },
            relations: ['settings'],
          });
          if (!fresh) continue;
          if (!fresh.lastActiveAt || fresh.lastActiveAt > deleteThreshold)
            continue;
          if (!(await this.isUserNotSubscribed(fresh.id))) continue;

          const hadEmail = !!fresh.email;

          await this.usersService.deleteUser(fresh.id);

          if (hadEmail) {
            try {
              const lang = fresh.settings.lang ?? Lang.EN;
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
          deletedCount++;
        } catch (e) {
          this.logger.error(`Delete failed for user ${u.id}`, e);
        }
      }

      this.logger.log(`Deleted ${deletedCount} users`);
    }
  }

  private async isUserNotSubscribed(userId: number): Promise<boolean> {
    const subscription = await this.userPlanStatesRepo.findOne({
      where: { userId },
      select: {
        id: true,
        source: true,
        accessStatus: true,
        useWithoutSubscription: true,
        expiryTime: true,
      },
    });

    return this.isNotSubscribed(subscription);
  }

  private isNotSubscribed(
    subscription:
      | Pick<
          UserPlanState,
          'source' | 'accessStatus' | 'useWithoutSubscription' | 'expiryTime'
        >
      | null,
  ): boolean {
    if (!subscription) return true;
    if (subscription.useWithoutSubscription) return true;
    if (!PAID_SOURCES.includes(subscription.source)) return true;
    if (subscription.accessStatus !== SubscriptionAccessStatus.ACTIVE) {
      return true;
    }

    return (
      !!subscription.expiryTime &&
      new Date(subscription.expiryTime).getTime() <= Date.now()
    );
  }

  private notSubscribedCondition(alias: string): Brackets {
    return new Brackets((qb) => {
      qb.where(`${alias}.id IS NULL`)
        .orWhere(`${alias}.useWithoutSubscription = true`)
        .orWhere(`${alias}.source NOT IN (:...paidSources)`)
        .orWhere(`${alias}.accessStatus != :activeAccessStatus`)
        .orWhere(
          `${alias}.expiryTime IS NOT NULL AND ${alias}.expiryTime <= :now`,
        );
    });
  }

  private notSubscribedParams() {
    return {
      paidSources: PAID_SOURCES,
      activeAccessStatus: SubscriptionAccessStatus.ACTIVE,
      now: this.now(),
    };
  }
}
