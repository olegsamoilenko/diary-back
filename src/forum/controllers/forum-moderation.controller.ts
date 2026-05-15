import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ForumModerationService } from '../services/forum-moderation.service';
import { UpdateForumCommentDto } from '../dto/update-forum-comment.dto';
import { ForumTopicModerationRemoveDto } from '../dto/admin/forum-topic-moderation-remove.dto';
import { ForumTopicModerationRestoreDto } from '../dto/admin/forum-topic-moderation-restore.dto';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('forum/moderation')
export class ForumModerationController {
  constructor(
    private readonly forumModerationService: ForumModerationService,
  ) {}

  @Patch('topics/:topicId/remove')
  async removeTopic(
    @Param('topicId') topicId: string,
    @Body() dto: ForumTopicModerationRemoveDto,
  ) {
    return await this.forumModerationService.removeTopic(topicId, dto);
  }

  @Patch('topics/:topicId/restore')
  async restoreTopic(
    @Param('topicId') topicId: string,
    @Body() dto: ForumTopicModerationRestoreDto,
  ) {
    return await this.forumModerationService.restoreTopic(topicId, dto);
  }

  @Patch('comments/:commentId/remove')
  async removeComment(
    @Param('commentId') commentId: string,
    @Body() dto: ForumTopicModerationRemoveDto,
  ) {
    return await this.forumModerationService.removeComment(commentId, dto);
  }

  @Patch('comments/:commentId/restore')
  async restoreComment(
    @Param('commentId') commentId: string,
    @Body() dto: ForumTopicModerationRestoreDto,
  ) {
    return await this.forumModerationService.restoreComment(commentId, dto);
  }
}
