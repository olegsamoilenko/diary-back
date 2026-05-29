import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ForumAccessService } from './forum-access.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';

@Controller('forum-access')
export class ForumAccessController {
  constructor(private readonly forumAccessService: ForumAccessService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('status')
  async getStatus(@ActiveUserData() user: ActiveUserDataT) {
    return this.forumAccessService.getAccessStatus(user.id);
  }
}
