import { IsEnum, IsUUID } from 'class-validator';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { ForumReactionType } from '../types/forum-reaction-type.enum';

export class ToggleForumReactionDto {
  @IsEnum(ForumReactionTargetType)
  targetType: ForumReactionTargetType;

  @IsUUID()
  targetId: string;

  @IsEnum(ForumReactionType)
  reactionType: ForumReactionType;
}
