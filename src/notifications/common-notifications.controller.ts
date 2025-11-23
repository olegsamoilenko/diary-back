import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommonNotificationsService } from './common-notifications.service';
import { CreateCommonNotificationDto } from './dto/create-common-notification.dto';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';

@Controller('common-notifications')
export class CommonNotificationsController {
  constructor(
    private readonly commonNotificationsService: CommonNotificationsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateCommonNotificationDto) {
    return await this.commonNotificationsService.create(dto);
  }

  @Get()
  async getAllReleaseNotificationsByPlatform(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 10;
    return await this.commonNotificationsService.getAllCommonNotificationsPaged(
      p,
      l,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('latest')
  async getLatest(@ActiveUserData() user: ActiveUserDataT) {
    return await this.commonNotificationsService.getUnreadCommonNotifications(
      user.id,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mark-as-read')
  async markAsRead(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: MarkAsReadDto,
  ) {
    return await this.commonNotificationsService.markAsRead(dto.ids, user.id);
  }

  @Delete(':id')
  async deleteReleaseNotification(@Param('id', ParseIntPipe) id: number) {
    return await this.commonNotificationsService.deleteCommonNotification(id);
  }
}
