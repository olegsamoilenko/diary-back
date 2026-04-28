// src/forum/controllers/forum-notifications.controller.ts

import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumNotificationsService } from '../services/forum-notifications.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/notifications')
@UseGuards(AuthGuard('jwt'))
export class ForumNotificationsController {
  constructor(
    private readonly notificationsService: ForumNotificationsService,
  ) {}

  @Get()
  getMyNotifications(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getMyNotifications(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }

  @Get('unread-count')
  getUnreadCount(@ActiveUserData() user: ActiveUserDataT) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':notificationId/read')
  markAsRead(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(user.id, notificationId);
  }

  @Patch('read-all')
  markAllAsRead(@ActiveUserData() user: ActiveUserDataT) {
    return this.notificationsService.markAllAsRead(user.id);
  }
}
