import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ForumModerationController } from './forum-moderation.controller';
import { ForumModerationService } from './forum-moderation.service';
import { ForumBaselineRiskCheckService } from './services/forum-baseline-risk-check.service';
import { ForumModerationLogService } from './services/forum-moderation-log.service';
import { ForumContentModerationLog } from './entities/forum-content-moderation-log.entity';
import { ForumAbuseGuardService } from './services/forum-abuse-guard.service';
import { ForumOpenAiModerationService } from './services/forum-openai-moderation.service';
import { ForumLlmModerationService } from './services/forum-llm-moderation.service';
import { ForumPublicProfile } from '../forum/entities/forum-public-profile.entity';
import { ForumModerationAiMonthlyUsage } from './entities/forum-moderation-ai-monthly-usage';
import { ForumModerationAiUsageService } from './services/forum-moderation-ai-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ForumContentModerationLog,
      ForumPublicProfile,
      ForumModerationAiMonthlyUsage,
    ]),
  ],
  controllers: [ForumModerationController],
  providers: [
    ForumModerationService,
    ForumBaselineRiskCheckService,
    ForumModerationLogService,
    ForumAbuseGuardService,
    ForumOpenAiModerationService,
    ForumLlmModerationService,
    ForumModerationAiUsageService,
  ],
  exports: [ForumModerationService],
})
export class ForumModerationModule {}
