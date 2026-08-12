import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PushNotificationsService } from './push-notifications.service';
import { UserRemindersService } from './user-reminders.service';

@Injectable()
export class PushNotificationsCron {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly userRemindersService: UserRemindersService,
  ) {}

  @Cron('0 * * * *')
  async handleDiaryIdleRemindersCron() {
    console.log('[PushNotificationsCron] diary idle reminders cron started');

    await this.pushNotificationsService.sendDiaryIdleReminders();

    console.log('[PushNotificationsCron] diary idle reminders cron finished');
  }

  @Cron('* * * * *')
  async handleUserRemindersCron() {
    const maxBatchesPerTick = 10;
    for (let batch = 0; batch < maxBatchesPerTick; batch += 1) {
      const processed = await this.userRemindersService.processDueReminders();
      if (processed < 500) break;
    }
  }
}
