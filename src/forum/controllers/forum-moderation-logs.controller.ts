import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ForumModerationLogsService } from '../services/forum-moderation-logs.service';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin/forum/moderation-logs')
@UseGuards(AuthGuard('jwt'))
export class ForumModerationLogsController {
  constructor(
    private readonly moderationLogsService: ForumModerationLogsService,
  ) {}

  @Get()
  getLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.moderationLogsService.getLogs(
      Number(page || 1),
      Number(limit || 50),
    );
  }

  @Get(':targetType/:targetId')
  getTargetLogs(
    @Param('targetType') targetType: ForumModerationTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.moderationLogsService.getTargetLogs(targetType, targetId);
  }
}
