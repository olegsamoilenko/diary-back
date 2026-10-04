import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SavePushTokenDto } from './dto/save-push-token.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { PushNotificationsService } from './push-notifications.service';
import { UserRemindersService } from './user-reminders.service';
import { ApplyReminderExtractionDto } from './dto/apply-reminder-extraction.dto';
import { ConfirmLocalReminderDto } from './dto/confirm-local-reminder.dto';

@Controller('push-notifications')
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly userRemindersService: UserRemindersService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('push-token')
  async savePushToken(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SavePushTokenDto,
  ) {
    return await this.pushNotificationsService.savePushToken(user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('reminders/apply-extraction')
  async applyReminderExtraction(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ApplyReminderExtractionDto,
  ) {
    return this.userRemindersService.applyExtraction(user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('reminders/upcoming')
  async listUpcomingReminders(@ActiveUserData() user: ActiveUserDataT) {
    return this.userRemindersService.listUpcoming(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('reminders/:id/local-scheduled')
  async confirmLocalReminder(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id') reminderId: string,
    @Body() dto: ConfirmLocalReminderDto,
  ) {
    return this.userRemindersService.confirmLocalScheduling(
      user.id,
      reminderId,
      dto.notificationId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('reminders/:id')
  async cancelReminder(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id') reminderId: string,
  ) {
    return this.userRemindersService.cancel(user.id, reminderId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('reminders/:id/local-transfer')
  async forgetTransferredReminder(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id') reminderId: string,
  ) {
    await this.userRemindersService.forgetTransferred(user.id, reminderId);
    return { transferred: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('reminders/local-transfer/history')
  async forgetFinishedHistory(@ActiveUserData() user: ActiveUserDataT) {
    await this.userRemindersService.forgetFinishedHistory(user.id);
    return { removed: true };
  }
}
