import { IsInt } from 'class-validator';

export class ForumTopicModerationRestoreDto {
  @IsInt()
  moderationRestoredByAdminId: number;

  @IsInt()
  targetUserId: number;
}
