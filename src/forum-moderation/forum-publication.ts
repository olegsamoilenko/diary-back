import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForumAbuseGuardService,
  ForumReservation,
} from './services/forum-abuse-guard.service';
import type { ForumModerationParams } from './forum-moderation.service';

/** One publication attempt, from admission through the actual DB commit. */
export class ForumPublication {
  private reservation?: ForumReservation;
  private heartbeat?: ReturnType<typeof setInterval>;
  private renewing = false;
  private lost = false;
  private committed = false;
  private uncertain = false;
  private readonly logger = new Logger(ForumPublication.name);

  constructor(
    private readonly guard: ForumAbuseGuardService,
    private readonly moderateContent: (
      params: ForumModerationParams,
      admitted: (reservation: ForumReservation) => void,
    ) => Promise<void>,
  ) {}

  async moderate(params: ForumModerationParams) {
    await this.moderateContent(params, (reservation) => {
      this.reservation = reservation;
      // Renew only while this operation runs; this is not a publication timeout.
      this.heartbeat = setInterval(() => {
        if (this.renewing) return;
        this.renewing = true;
        void this.guard
          .renew(reservation)
          .then((owned) => {
            if (!owned) this.lost = true;
          })
          .catch(() => {
            this.lost = true;
          })
          .finally(() => {
            this.renewing = false;
          });
      }, 60_000);
      this.heartbeat.unref?.();
    });
    await this.assertOwned();
  }

  private async assertOwned() {
    if (
      this.reservation &&
      (this.lost || !(await this.guard.renew(this.reservation)))
    )
      throw new ServiceUnavailableException(
        'Publication reservation lost; please retry',
      );
  }

  async transaction<T>(
    source: DataSource,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = source.createQueryRunner();
    let started = false;
    let committing = false;
    try {
      await runner.connect();
      await runner.startTransaction();
      started = true;
      await this.assertOwned();
      const result = await work(runner.manager);
      await this.assertOwned();
      committing = true;
      await runner.commitTransaction();
      this.committed = true;
      return result;
    } catch (error) {
      // A rejected COMMIT can mean its acknowledgement was lost. Never unlock
      // a retry on that evidence alone, even if a later ROLLBACK returns OK.
      if (committing) this.uncertain = true;
      if (started && runner.isTransactionActive) {
        try {
          await runner.rollbackTransaction();
        } catch {
          this.uncertain = true;
        }
      } else if (started) {
        this.uncertain = true;
      }
      throw error;
    } finally {
      try {
        await runner.release();
      } catch {
        this.logger.warn('Forum transaction connection cleanup failed');
      }
    }
  }

  async run<T>(
    work: (publication: ForumPublication) => Promise<T>,
  ): Promise<T> {
    try {
      return await work(this);
    } finally {
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.reservation) {
        const retain =
          this.committed || this.uncertain || this.reservation.policyRejected;
        try {
          await this.guard.finish(this.reservation, !!retain);
        } catch {
          this.logger.warn(
            'Forum admission finalization failed; reservation retained until expiry',
          );
        }
      }
    }
  }
}
