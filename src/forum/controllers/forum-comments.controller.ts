import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumCommentsService } from '../services/forum-comments.service';
import { CreateForumCommentDto } from '../dto/create-forum-comment.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';
import { UpdateForumCommentDto } from '../dto/update-forum-comment.dto';

@Controller('forum')
export class ForumCommentsController {
  constructor(private readonly commentsService: ForumCommentsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('topics/:topicId/comments')
  getTopicComments(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.commentsService.getTopicComments(topicId, user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('topics/:topicId/comments')
  createComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
    @Body() dto: CreateForumCommentDto,
  ) {
    return this.commentsService.createComment(user.id, topicId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('comments/:commentId/read')
  async markCommentRead(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('commentId') commentId: string,
  ) {
    return await this.commentsService.markCommentRead(user.id, commentId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('comments/:commentId')
  updateComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateForumCommentDto,
  ) {
    return this.commentsService.updateComment(user.id, commentId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('comments/:commentId/soft-delete')
  softDeleteComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.softDeleteComment(user.id, commentId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('comments/:commentId')
  deleteComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.deleteComment(user.id, commentId);
  }
}
