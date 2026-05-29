import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { ForumModerationTargetType } from '../enums/forum-moderation-target-type.enum';

export class ModerateForumContentDto {
  @IsInt()
  userId: number;

  @IsEnum(ForumModerationTargetType)
  targetType: ForumModerationTargetType;

  @IsOptional()
  @IsUUID()
  targetId?: string | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsString()
  content: string;
}
