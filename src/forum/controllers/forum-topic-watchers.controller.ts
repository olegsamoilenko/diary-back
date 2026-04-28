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
import { ForumTopicWatchersService } from '../services/forum-topic-watchers.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum')
@UseGuards(AuthGuard('jwt'))
export class ForumTopicWatchersController {
  constructor(private readonly watchersService: ForumTopicWatchersService) {}

  @Post('topics/:topicId/watch')
  watchTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.watchersService.watchTopic(user.id, topicId);
  }

  @Delete('topics/:topicId/watch')
  unwatchTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.watchersService.unwatchTopic(user.id, topicId);
  }

  @Patch('topics/:topicId/mute')
  muteTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
    @Body('isMuted') isMuted: boolean,
  ) {
    return this.watchersService.muteTopic(user.id, topicId, isMuted);
  }

  @Get('unread-count')
  getUnreadCount(@ActiveUserData() user: ActiveUserDataT) {
    return this.watchersService.getUnreadWatchedTopicsCount(user.id);
  }
}
