// src/forum/controllers/forum-messages.controller.ts

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
import { ForumMessagesService } from '../services/forum-messages.service';
import { SendForumMessageDto } from '../dto/send-forum-message.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/messages')
@UseGuards(AuthGuard('jwt'))
export class ForumMessagesController {
  constructor(private readonly messagesService: ForumMessagesService) {}

  @Post()
  sendMessage(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SendForumMessageDto,
  ) {
    return this.messagesService.sendMessage(user.id, dto);
  }

  @Get('unread-count')
  getUnreadMessagesCount(@ActiveUserData() user: ActiveUserDataT) {
    return this.messagesService.getUnreadMessagesCount(user.id);
  }

  @Get('conversation/:conversationId')
  getConversationMessages(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('conversationId') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getConversationMessages(
      user.id,
      conversationId,
      Number(page || 1),
      Number(limit || 50),
    );
  }

  @Patch('conversation/:conversationId/read')
  markConversationAsRead(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagesService.markConversationAsRead(user.id, conversationId);
  }

  @Delete(':messageId')
  deleteMessage(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.deleteMessage(user.id, messageId);
  }
}
