import { Controller, UseGuards, Get, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ForumActivityService } from '../services/forum-activity.service';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('admin/forum/activity')
export class ForumActivityController {
  constructor(private readonly forumActivityService: ForumActivityService) {}

  @Get('get')
  async getForumActivity(@Query('days') days?: string) {
    return this.forumActivityService.getDailyCommunityActivity(
      Number(days) || 30,
    );
  }
}
