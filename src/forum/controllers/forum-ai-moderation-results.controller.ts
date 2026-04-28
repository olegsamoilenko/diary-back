// src/forum/controllers/forum-ai-moderation-results.controller.ts

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ForumAiModerationResultsService } from '../services/forum-ai-moderation-results.service';
import { ForumAiModerationTargetType } from '../types/forum-ai-moderation-target-type.enum';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin/forum/ai-moderation-results')
@UseGuards(AuthGuard('jwt'))
export class ForumAiModerationResultsController {
  constructor(
    private readonly aiModerationResultsService: ForumAiModerationResultsService,
  ) {}

  @Get('needs-review')
  getNeedsReview(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.aiModerationResultsService.getNeedsReview(
      Number(page || 1),
      Number(limit || 50),
    );
  }

  @Get(':targetType/:targetId/latest')
  getLatestForTarget(
    @Param('targetType') targetType: ForumAiModerationTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.aiModerationResultsService.getLatestForTarget(
      targetType,
      targetId,
    );
  }
}
