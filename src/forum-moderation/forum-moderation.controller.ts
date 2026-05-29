import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ForumModerationService } from './forum-moderation.service';
import { ModerateForumContentDto } from './dto/moderate-forum-content.dto';
import { ForumModerationAiUsageService } from './services/forum-moderation-ai-usage.service';
import { GetForumModerationLogsQueryDto } from './dto/get-forum-moderation-logs-query.dto';

@Controller('forum-moderation')
export class ForumModerationController {
  constructor(
    private readonly moderationService: ForumModerationService,
    private readonly moderationAiUsageService: ForumModerationAiUsageService,
  ) {}

  // @Post('check')
  // async check(@Body() dto: ModerateForumContentDto) {
  //   await this.moderationService.moderateOrThrow(dto);
  //
  //   return {
  //     allowed: true,
  //   };
  // }

  @Get('admin/ai-usage')
  async getAiUsage(@Query('month') month?: string) {
    return await this.moderationAiUsageService.getMonthlyUsage();
  }

  @Get('admin/logs')
  async getModerationLogs(@Query() query: GetForumModerationLogsQueryDto) {
    return this.moderationService.getModerationLogs(query);
  }
}
