import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ForumService } from '../services/forum.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum')
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('unread/summary')
  async getUnreadSummary(@ActiveUserData() user: ActiveUserDataT) {
    return this.forumService.getUnreadSummary(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('topics/:topicId/unread-session')
  async getTopicUnreadSession(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.forumService.getTopicUnreadSession(user.id, topicId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('topics/:topicId/view')
  async markTopicViewed(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.forumService.markTopicViewed(user.id, topicId);
  }
}
