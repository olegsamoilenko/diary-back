import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
