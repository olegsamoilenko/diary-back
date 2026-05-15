import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SavePushTokenDto } from './dto/save-push-token.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { PushNotificationsService } from './push-notifications.service';

@Controller('push-notifications')
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('push-token')
  async savePushToken(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SavePushTokenDto,
  ) {
    return await this.pushNotificationsService.savePushToken(user.id, dto);
  }
}
