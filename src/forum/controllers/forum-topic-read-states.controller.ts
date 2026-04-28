import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumTopicReadStatesService } from '../services/forum-topic-read-states.service';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

class MarkForumTopicReadDto {
  @IsOptional()
  @IsUUID()
  lastReadCommentId?: string;
}

@Controller('forum')
@UseGuards(AuthGuard('jwt'))
export class ForumTopicReadStatesController {
  constructor(
    private readonly readStatesService: ForumTopicReadStatesService,
  ) {}

  @Post('topics/:topicId/read')
  markTopicAsRead(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
    @Body() dto: MarkForumTopicReadDto,
  ) {
    return this.readStatesService.markTopicAsRead(
      user.id,
      topicId,
      dto.lastReadCommentId,
    );
  }

  @Get('topics/:topicId/read-state')
  getTopicReadState(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.readStatesService.getTopicReadState(user.id, topicId);
  }

  @Get('unread-count')
  getUnreadCount(@ActiveUserData() user: ActiveUserDataT) {
    return this.readStatesService.getUnreadWatchedTopicsCount(user.id);
  }
}
