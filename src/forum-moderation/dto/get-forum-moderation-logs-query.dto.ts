import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ForumModerationTargetType } from '../enums/forum-moderation-target-type.enum';

export class GetForumModerationLogsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsEnum(ForumModerationTargetType)
  targetType?: ForumModerationTargetType;
}
