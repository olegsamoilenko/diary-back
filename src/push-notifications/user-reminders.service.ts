import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { ApplyReminderExtractionDto } from './dto/apply-reminder-extraction.dto';
import { PushNotificationsService } from './push-notifications.service';
import { UserReminder } from './entities/user-reminder.entity';

const CLAIM_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 3;
const PROCESSING_LOCK_TIMEOUT_MINUTES = 5;

@Injectable()
export class UserRemindersService {
  constructor(
    @InjectRepository(UserReminder)
    private readonly reminderRepo: Repository<UserReminder>,
    private readonly dataSource: DataSource,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async applyExtraction(userId: number, dto: ApplyReminderExtractionDto) {
    const saved: UserReminder[] = [];
    const cancelled: UserReminder[] = [];

    for (const draft of dto.reminders) {
      const scheduledAt = new Date(draft.scheduledAt);
      if (
        !Number.isFinite(scheduledAt.getTime()) ||
        scheduledAt.getTime() <= Date.now()
      ) {
        continue;
      }

      const reminderKey = this.buildReminderKey(
        dto.sourceType,
        dto.sourceId,
        draft.reminderKey,
      );
      const existing = await this.reminderRepo.findOne({
        where: { userId, reminderKey },
      });
      const reminder =
        existing ?? this.reminderRepo.create({ userId, reminderKey });
      const previousScheduledAt = existing?.scheduledAt?.getTime() ?? null;

      Object.assign(reminder, {
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        sourceDate: dto.sourceDate ?? null,
        sourceEntryKind: dto.sourceEntryKind ?? null,
        title: draft.title?.trim() || 'Nemory',
        body: draft.body.trim(),
        scheduledAt,
        localDate: draft.localDate,
        localTime: draft.localTime,
        timezone: dto.timezone,
        status: 'pending' as const,
        attempts: 0,
        lastError: null,
        lockedAt: null,
        sentAt: null,
        cancelledAt: null,
      });

      const scheduleChanged =
        !existing || previousScheduledAt !== scheduledAt.getTime();
      if (scheduleChanged) {
        reminder.localNotificationId = null;
        reminder.localScheduledAt = null;
      }
      saved.push(await this.reminderRepo.save(reminder));
    }

    for (const update of dto.updates ?? []) {
      const candidates = await this.reminderRepo.find({
        where: {
          userId,
          status: In(['pending', 'processing']),
        },
      });
      const matching = candidates.filter(
        (item) =>
          item.reminderKey === update.reminderKey ||
          item.reminderKey.endsWith(`:${update.reminderKey}`),
      );
      for (const reminder of matching) {
        reminder.status = 'cancelled';
        reminder.cancelledAt = new Date();
        reminder.lockedAt = null;
        cancelled.push(await this.reminderRepo.save(reminder));
      }
    }

    return { reminders: saved, cancelled };
  }

  async listUpcoming(userId: number) {
    return this.reminderRepo
      .createQueryBuilder('reminder')
      .where('reminder.userId = :userId', { userId })
      .andWhere('reminder.status = :status', { status: 'pending' })
      .andWhere('reminder.scheduledAt > :now', { now: new Date() })
      .orderBy('reminder.scheduledAt', 'ASC')
      .getMany();
  }

  /** New clients store reminder content only on their device. Legacy APIs remain live. */
  async forgetTransferred(userId: number, id: string) {
    await this.reminderRepo.delete({ id, userId });
  }

  async forgetFinishedHistory(userId: number) {
    await this.reminderRepo.delete([
      { userId, status: In(['sent', 'cancelled', 'failed']) },
      { userId, status: 'pending', scheduledAt: LessThanOrEqual(new Date()) },
    ]);
  }

  async confirmLocalScheduling(
    userId: number,
    reminderId: string,
    notificationId: string,
  ) {
    const reminder = await this.reminderRepo.findOne({
      where: { id: reminderId, userId },
    });
    if (!reminder || reminder.status !== 'pending') return null;

    reminder.localNotificationId = notificationId;
    reminder.localScheduledAt = new Date();
    reminder.lastError = null;
    return this.reminderRepo.save(reminder);
  }

  async cancel(userId: number, reminderId: string) {
    const reminder = await this.reminderRepo.findOne({
      where: { id: reminderId, userId },
    });
    if (!reminder || ['sent', 'cancelled'].includes(reminder.status))
      return reminder;

    reminder.status = 'cancelled';
    reminder.cancelledAt = new Date();
    reminder.lockedAt = null;
    return this.reminderRepo.save(reminder);
  }

  async processDueReminders(batchSize = CLAIM_BATCH_SIZE) {
    const due = await this.claimDueBatch(batchSize);
    if (!due.length) return 0;

    const remoteFallbacks = due.filter(
      (reminder) => !reminder.localScheduledAt,
    );
    const acceptedReminderIds = remoteFallbacks.length
      ? await this.pushNotificationsService.sendNemoryReminderPushBatch(
          remoteFallbacks.map((reminder) => ({
            userId: reminder.userId,
            reminderId: reminder.id,
            title: reminder.title,
            body: reminder.body,
            sourceType: reminder.sourceType,
            sourceId: reminder.sourceId,
            sourceDate: reminder.sourceDate,
            sourceEntryKind: reminder.sourceEntryKind,
          })),
        )
      : new Set<string>();

    for (const reminder of due) {
      try {
        if (
          !reminder.localScheduledAt &&
          !acceptedReminderIds.has(reminder.id)
        ) {
          throw new Error('No active push token accepted the reminder');
        }
        await this.reminderRepo.update(reminder.id, {
          status: 'sent',
          sentAt: new Date(),
          lockedAt: null,
          lastError: null,
        });
      } catch (error) {
        const attempts = reminder.attempts + 1;
        await this.reminderRepo.update(reminder.id, {
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lockedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return due.length;
  }

  private buildReminderKey(
    sourceType: string,
    sourceId: string,
    reminderKey: string,
  ) {
    const normalized = reminderKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_');
    return `${sourceType}:${sourceId}:${normalized}`.slice(0, 255);
  }

  private async claimDueBatch(limit: number): Promise<UserReminder[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE user_reminders
         SET status = 'pending', locked_at = NULL
         WHERE status = 'processing'
           AND locked_at < NOW() - INTERVAL '${PROCESSING_LOCK_TIMEOUT_MINUTES} minutes'`,
      );

      const queryResult: unknown = await manager.query(
        `UPDATE user_reminders
         SET status = 'processing', locked_at = NOW(), updated_at = NOW()
         WHERE id IN (
           SELECT id
           FROM user_reminders
           WHERE status = 'pending' AND scheduled_at <= NOW()
           ORDER BY scheduled_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         RETURNING
           id,
           user_id AS "userId",
           reminder_key AS "reminderKey",
           source_type AS "sourceType",
           source_id AS "sourceId",
           source_date AS "sourceDate",
           source_entry_kind AS "sourceEntryKind",
           title,
           body,
           scheduled_at AS "scheduledAt",
           local_date AS "localDate",
           local_time AS "localTime",
           timezone,
           status,
           local_notification_id AS "localNotificationId",
           local_scheduled_at AS "localScheduledAt",
           attempts,
           last_error AS "lastError",
           locked_at AS "lockedAt"`,
        [Math.max(1, Math.min(limit, CLAIM_BATCH_SIZE))],
      );

      const rows =
        Array.isArray(queryResult) &&
        Array.isArray(queryResult[0]) &&
        typeof queryResult[1] === 'number'
          ? queryResult[0]
          : queryResult;

      if (!Array.isArray(rows)) return [];

      return rows.filter((row): row is UserReminder => {
        if (!row || typeof row !== 'object') return false;
        const id = (row as Record<string, unknown>).id;
        return typeof id === 'string' && id.length > 0;
      });
    });
  }
}
