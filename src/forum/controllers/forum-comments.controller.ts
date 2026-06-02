import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  @Get('comments/roots')
  getRootComments(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('topicId') topicId: string,
    @Query('cursor') cursor?: string,
    @Query('rootLimit') rootLimit = '5',
    @Query('replyPreviewLimit') replyPreviewLimit = '5',
  ) {
    return this.commentsService.getRootCommentsPage({
      topicId,
      userId: user.id,
      cursor,
      rootLimit: Number(rootLimit),
      replyPreviewLimit: Number(replyPreviewLimit),
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('comments/replies')
  getReplies(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('parentId') parentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '10',
  ) {
    return this.commentsService.getRepliesPage({
      parentId,
      userId: user.id,
      cursor,
      limit: Number(limit),
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('comments/replies-before')
  getRepliesBefore(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('parentId') parentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '10',
  ) {
    return this.commentsService.getRepliesBeforePage({
      parentId,
      userId: user.id,
      cursor,
      limit: Number(limit),
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('comments/roots-before')
  getRootCommentsBefore(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('topicId') topicId: string,
    @Query('cursor') cursor?: string,
    @Query('rootLimit') rootLimit = '10',
    @Query('replyPreviewLimit') replyPreviewLimit = '5',
  ) {
    return this.commentsService.getRootCommentsBeforePage({
      topicId,
      userId: user.id,
      cursor,
      rootLimit: Number(rootLimit),
      replyPreviewLimit: Number(replyPreviewLimit),
    });
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
  @Get('comments/:commentId/context')
  getCommentContext(
    @Param('commentId') commentId: string,
    @ActiveUserData() user: ActiveUserDataT,
    @Query('rootAroundLimit') rootAroundLimit = '5',
    @Query('repliesAroundLimit') repliesAroundLimit = '5',
    @Query('replyPreviewLimit') replyPreviewLimit = '5',
  ) {
    return this.commentsService.getCommentContext({
      commentId,
      userId: user.id,
      rootAroundLimit: Number(rootAroundLimit),
      repliesAroundLimit: Number(repliesAroundLimit),
      replyPreviewLimit: Number(replyPreviewLimit),
    });
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
