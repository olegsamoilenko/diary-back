import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import Redis from 'ioredis';

import { User } from 'src/users/entities/user.entity';
import { EmailsService } from 'src/emails/emails.service';
import { UsersService } from 'src/users/users.service';
import { Plans, PlanStatus } from 'src/plans/types';
import { Lang } from 'src/users/types';

const NOT_SUBSCRIBED_STATUSES: PlanStatus[] = [
  PlanStatus.INACTIVE,
  PlanStatus.CANCELED,
  PlanStatus.EXPIRED,
  PlanStatus.REFUNDED,
];

const PAID_PLANS: Plans[] = [Plans.LITE, Plans.BASE, Plans.PRO];

// бізнес-правила
const WARN_AFTER_DAYS = 60;
const DELETE_AFTER_DAYS = 90;
// розмір батча
const BATCH_SIZE = 200;
// TTL локера (сек)
const LOCK_TTL_SEC = 25 * 60;

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

  // щодня о 03:10 (час сервера)
  @Cron('10 3 * * *')
  async runDaily() {
    const lockKey = 'cron:inactive-cleanup:lock';
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      LOCK_TTL_SEC,
      'NX',
    );
    if (!acquired) {
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

  /**
   * Крок 1: попереджаємо користувачів, які:
   *  - мають email,
   *  - не отримували попередження,
   *  - остання активність: >60д і ≤90д тому,
   *  - НЕ мають жодної активної платної підписки.
   */
  private async sendWarnings() {
    const warnThreshold = this.daysAgo(WARN_AFTER_DAYS);
    const deleteThreshold = this.daysAgo(DELETE_AFTER_DAYS);

    let lastId = 0;

    while (true) {
      // 1) стабільно дістаємо тільки id-шники (без JOINів)
      const idRows = await this.usersRepo
        .createQueryBuilder('u')
        .select('u.id', 'id')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.inactivityWarnedAt IS NULL')
        .andWhere('u.email IS NOT NULL')
        .andWhere("u.email <> ''")
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :warn', { warn: warnThreshold })
        .andWhere('u.lastActiveAt > :del', { del: deleteThreshold })
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .getRawMany<{ id: number }>();

      if (idRows.length === 0) break;
      lastId = idRows[idRows.length - 1].id;

      // 2) підтягнемо всю потрібну інформацію одним запитом
      const users = await this.usersRepo.find({
        where: { id: In(idRows.map((x) => x.id)) },
        relations: ['plans', 'settings'],
        // select можна й опустити, щоб не гратися з полями під-реляцій
      });

      for (const fresh of users) {
        try {
          // додаткова валідація на випадок гонок/змін
          if (!fresh.email) continue;
          if (!fresh.lastActiveAt) continue;
          if (fresh.lastActiveAt > warnThreshold) continue;
          if (fresh.lastActiveAt <= deleteThreshold) continue; // це вже зона видалення
          if (fresh.inactivityWarnedAt) continue;
          if (!this.isNotSubscribed(fresh)) continue;

          const scheduledDeletionAt = new Date(
            fresh.lastActiveAt.getTime() + DELETE_AFTER_DAYS * 86400000,
          );

          await this.usersRepo.update(fresh.id, {
            inactivityWarnedAt: this.now(),
            scheduledDeletionAt,
          } as any);

          // емейл
          const lang = fresh.settings?.lang ?? Lang.EN;
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
            `Failed to warn user ${fresh.id} (${fresh.email ?? 'no-email'}): ${msg}`,
          );
        }
      }
    }
  }

  /**
   * Крок 2: видаляємо користувачів, які:
   *  - остання активність ≤90д тому,
   *  - НЕ мають жодної активної платної підписки.
   */
  private async deleteExpired() {
    const deleteThreshold = this.daysAgo(DELETE_AFTER_DAYS);

    let lastId = 0;

    while (true) {
      // 1) стабільно дістаємо тільки id-шники (без JOINів)
      const idRows = await this.usersRepo
        .createQueryBuilder('u')
        .select('u.id', 'id')
        .where('u.id > :lastId', { lastId })
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('u.lastActiveAt <= :del', { del: deleteThreshold })
        .orderBy('u.id', 'ASC')
        .limit(BATCH_SIZE)
        .getRawMany<{ id: number }>();

      if (idRows.length === 0) break;
      lastId = idRows[idRows.length - 1].id;

      // 2) підтягнемо потрібні дані одним запитом
      const users = await this.usersRepo.find({
        where: { id: In(idRows.map((x) => x.id)) },
        relations: ['plans', 'settings'],
      });

      for (const fresh of users) {
        try {
          if (!fresh.lastActiveAt || fresh.lastActiveAt > deleteThreshold)
            continue;
          if (!this.isNotSubscribed(fresh)) continue;

          const hadEmail = !!fresh.email;
          const email = fresh.email ?? undefined;

          await this.usersService.deleteUser(fresh.id);

          if (hadEmail && email) {
            try {
              const lang = fresh.settings?.lang ?? Lang.EN;
              await this.emailsService.send(
                [email],
                lang === Lang.EN
                  ? 'Account deleted'
                  : 'Обліковий запис видалено',
                lang === Lang.EN
                  ? '/auth/account-deleted-en'
                  : '/auth/account-deleted-uk',
              );
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.logger.warn(
                `Failed to send deletion mail to ${email}: ${msg}`,
              );
            }
          }
        } catch (e) {
          this.logger.error(`Delete failed for user ${fresh.id}`, e);
        }
      }
    }
  }

  /**
   * true, якщо у користувача НЕМА жодної активної платної підписки
   * (Lite/Base/Pro зі статусом не у NOT_SUBSCRIBED_STATUSES)
   */
  private isNotSubscribed(u: {
    plans?: { name?: Plans; status?: PlanStatus }[] | null;
  }): boolean {
    const plans = u.plans ?? [];
    if (plans.length === 0) return true;

    const isPaid = (n?: Plans) =>
      n === Plans.LITE || n === Plans.BASE || n === Plans.PRO;

    const hasActivePaid = plans.some(
      (p) =>
        isPaid(p.name) &&
        p.status !== undefined &&
        !NOT_SUBSCRIBED_STATUSES.includes(p.status),
    );

    return !hasActivePaid;
  }
}
