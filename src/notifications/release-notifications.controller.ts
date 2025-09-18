import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ReleaseNotificationsService } from './release-notifications.service';
import { CreateReleaseNotificationDto } from './dto/create-release-notification.dto';
import { SkipThisVersionDto } from './dto/skip-this-version.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { GetLatestReleaseNotificationDto } from './dto/get-latest-release-notification.dto';

@Controller('release-notifications')
export class ReleaseNotificationsController {
  constructor(
    private readonly releaseNotificationsService: ReleaseNotificationsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateReleaseNotificationDto) {
    return await this.releaseNotificationsService.create(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('latest')
  async getLatest(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: GetLatestReleaseNotificationDto,
  ) {
    return await this.releaseNotificationsService.getLastReleaseNotification(
      dto.platform,
      dto.build,
      user.id,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('skip-this-version')
  async skipThisVersion(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SkipThisVersionDto,
  ) {
    return await this.releaseNotificationsService.skipThisVersion(
      dto.platform,
      dto.build,
      user.id,
    );
  }
}
