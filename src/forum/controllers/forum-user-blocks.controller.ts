// src/forum/controllers/forum-user-blocks.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumUserBlocksService } from '../services/forum-user-blocks.service';
import { BlockForumUserDto } from '../dto/block-forum-user.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/user-blocks')
@UseGuards(AuthGuard('jwt'))
export class ForumUserBlocksController {
  constructor(private readonly userBlocksService: ForumUserBlocksService) {}

  @Post()
  blockUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: BlockForumUserDto,
  ) {
    return this.userBlocksService.blockUser(user.id, dto);
  }

  @Delete(':blockedUserId')
  unblockUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    return this.userBlocksService.unblockUser(user.id, Number(blockedUserId));
  }

  @Get('my')
  getMyBlockedUsers(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userBlocksService.getMyBlockedUsers(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }
}
