import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumBookmarksService } from '../services/forum-bookmarks.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/bookmarks')
@UseGuards(AuthGuard('jwt'))
export class ForumBookmarksController {
  constructor(private readonly bookmarksService: ForumBookmarksService) {}

  @Get()
  getMyBookmarks(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookmarksService.getMyBookmarks(
      user.id,
      Number(page || 1),
      Number(limit || 30),
    );
  }

  @Post(':topicId/toggle')
  toggleBookmark(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.bookmarksService.toggleBookmark(user.id, topicId);
  }

  @Get(':topicId/status')
  isBookmarked(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.bookmarksService.isBookmarked(user.id, topicId);
  }
}
