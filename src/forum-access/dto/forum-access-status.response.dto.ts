import { ForumAccessMode } from '../enums/forum-access-mode.enum';

export class ForumAccessLimitUsageDto {
  used: number;
  limit: number | null;
  remaining: number | null;
}

export class ForumAccessStatusResponseDto {
  mode: ForumAccessMode;
  isLimited: boolean;
  isGrandfathered: boolean;
  hasUnlimitedAccess: boolean;
  period: string;
  topics: ForumAccessLimitUsageDto;
  comments: ForumAccessLimitUsageDto;
}
