import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ForumViewsService } from '../services/forum-views.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/views')
@UseGuards(AuthGuard('jwt'))
export class ForumViewsController {
  constructor(private readonly viewsService: ForumViewsService) {}

  @Post('topics/:topicId')
  registerTopicView(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.viewsService.registerTopicView(user.id, topicId);
  }
}
