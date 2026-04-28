import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

@Controller('forum')
export class ForumCommentsController {
  constructor(private readonly commentsService: ForumCommentsService) {}

  @Get('topics/:topicId/comments')
  getTopicComments(@Param('topicId') topicId: string) {
    return this.commentsService.getTopicComments(topicId);
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
  @Delete('comments/:commentId')
  deleteComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.deleteComment(user.id, commentId);
  }
}
