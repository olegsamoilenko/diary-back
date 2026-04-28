import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ForumMentionsService } from '../services/forum-mentions.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/mentions')
@UseGuards(AuthGuard('jwt'))
export class ForumMentionsController {
  constructor(private readonly mentionsService: ForumMentionsService) {}

  @Get('my')
  getMyMentions(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.mentionsService.getMyMentions(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }
}
