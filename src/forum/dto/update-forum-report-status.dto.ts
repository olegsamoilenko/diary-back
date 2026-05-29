import { IsEnum, IsInt } from 'class-validator';
import { ForumReportStatus } from '../types/forum-report-status.enum';

export class UpdateForumReportStatusDto {
  @IsEnum(ForumReportStatus)
  status: ForumReportStatus;

  @IsInt()
  adminId: number;
}
