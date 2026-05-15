import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ForumModerationAction } from '../types/forum-moderation-action.enum';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { ForumModerationReason } from '../types/forum-moderation-reason.enum';

export class CreateForumModerationLogDto {
  @IsEnum(ForumModerationAction)
  action: ForumModerationAction;

  @IsEnum(ForumModerationTargetType)
  targetType: ForumModerationTargetType;

  @IsString()
  @MaxLength(80)
  targetId: string;

  @IsOptional()
  @IsEnum(ForumModerationReason)
  reason?: ForumModerationReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
