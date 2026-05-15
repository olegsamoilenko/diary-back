import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminForumService } from '../services/admin-forum.service';
import { GetAdminForumTopicsDto } from '../dto/admin/get-admin-forum-topics.dto';
import { GetAdminTopicCommentsDto } from '../dto/admin/get-admin-topic-comments.dto';
import { GetAdminUserModerationLogsDto } from '../dto/admin/get-admin-user-moderation-logs';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('admin/forum')
export class AdminForumController {
  constructor(private readonly adminForumService: AdminForumService) {}

  @Get('topics')
  getTopics(@Query() dto: GetAdminForumTopicsDto) {
    return this.adminForumService.getTopics(dto);
  }

  @Post('topics/:topicId/comments')
  getTopicComments(
    @Param('topicId') topicId: string,
    @Body() dto: GetAdminTopicCommentsDto,
  ) {
    return this.adminForumService.getTopicComments(topicId, dto);
  }

  @Get('users/:userId/moderation-logs')
  getUserModerationLogs(
    @Param('userId') userId: string,
    @Query() dto: GetAdminUserModerationLogsDto,
  ) {
    return this.adminForumService.getUserModerationLogs(Number(userId), dto);
  }

  @Get('moderation-target/:targetType/:targetId')
  getModerationTarget(
    @Param('targetType') targetType: ForumModerationTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.adminForumService.getModerationTarget(targetType, targetId);
  }
}
