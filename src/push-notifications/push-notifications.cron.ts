import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class PushNotificationsCron {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  // TEMP для тестів: кожні 5 хвилин
  @Cron('*/5 * * * *')
  async handleDiaryIdleRemindersCron() {
    console.log('[PushNotificationsCron] diary idle reminders cron started');

    await this.pushNotificationsService.sendDiaryIdleReminders();

    console.log('[PushNotificationsCron] diary idle reminders cron finished');
  }
}
