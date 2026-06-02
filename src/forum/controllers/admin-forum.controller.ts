import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Query,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminForumService } from '../services/admin-forum.service';
import { GetAdminForumTopicsDto } from '../dto/admin/get-admin-forum-topics.dto';
import { GetAdminTopicCommentsDto } from '../dto/admin/get-admin-topic-comments.dto';
import { GetAdminUserModerationLogsDto } from '../dto/admin/get-admin-user-moderation-logs';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { CreateAdminForumCommentDto } from '../dto/admin/create-admin-forum-comment.dto';
import { Role } from '../../users/types';
import { CreateSystemTopicsDto } from '../dto/admin/create-system-topics.dto';

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

  @Get('users/:role/get')
  getUserByRole(@Param('role') role: Role) {
    return this.adminForumService.getUserByRole(role);
  }

  @Get('moderation-target/:targetType/:targetId')
  getModerationTarget(
    @Param('targetType') targetType: ForumModerationTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.adminForumService.getModerationTarget(targetType, targetId);
  }

  @Post('topics/:topicId/create-comment')
  createComment(
    @Param('topicId') topicId: string,
    @Body() dto: CreateAdminForumCommentDto,
  ) {
    return this.adminForumService.createComment(topicId, dto);
  }

  @Post('topics/create')
  createSystemTopicWithTranslations(@Body() dto: CreateSystemTopicsDto) {
    return this.adminForumService.createSystemTopicWithTranslations(dto);
  }

  @Patch('topics/:topicId/edit')
  updateSystemTopic(
    @Param('topicId') topicId: string,
    @Body() dto: CreateSystemTopicsDto,
  ) {
    return this.adminForumService.updateSystemTopic(topicId, dto);
  }

  @Get('topics/:topicId/comments/:commentId/location')
  async getCommentLocationInTopic(
    @Param('topicId') topicId: string,
    @Param('commentId') commentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminForumService.getCommentLocationInTopic(
      topicId,
      commentId,
      limit ? Number(limit) : 20,
    );
  }
}
