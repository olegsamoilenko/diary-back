import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ForumReportTargetType } from '../types/forum-report-target-type.enum';
import { ForumReportReason } from '../types/forum-report-reason.enum';

export class CreateForumReportDto {
  @IsEnum(ForumReportTargetType)
  targetType: ForumReportTargetType;

  @IsString()
  @MaxLength(80)
  targetId: string;

  @IsEnum(ForumReportReason)
  reason: ForumReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
