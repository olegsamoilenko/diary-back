import { IsEnum, IsInt, IsString } from 'class-validator';
import { ForumModerationReason } from '../../types/forum-moderation-reason.enum';

export class ForumTopicModerationRemoveDto {
  @IsInt()
  moderationRemovedByAdminId: number;

  @IsInt()
  targetUserId: number;

  @IsEnum(ForumModerationReason)
  moderationRemoveReason: ForumModerationReason;

  @IsString()
  moderationRemoveNote: string;
}
