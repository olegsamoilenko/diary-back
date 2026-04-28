// src/forum/controllers/forum-conversations.controller.ts

import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumConversationsService } from '../services/forum-conversations.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/conversations')
@UseGuards(AuthGuard('jwt'))
export class ForumConversationsController {
  constructor(
    private readonly conversationsService: ForumConversationsService,
  ) {}

  @Get()
  getMyConversations(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationsService.getMyConversations(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }

  @Post('with/:targetUserId')
  getOrCreateConversation(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.conversationsService.getOrCreateConversation(
      user.id,
      Number(targetUserId),
    );
  }

  @Get(':conversationId')
  getConversation(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.getConversation(user.id, conversationId);
  }

  @Patch(':conversationId/archive')
  archiveConversation(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.archiveConversation(
      user.id,
      conversationId,
    );
  }
}
