import {
  IsArray,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExtractedScheduledReminderDto {
  @IsString()
  @MaxLength(128)
  reminderKey: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(1000)
  body: string;

  @IsISO8601()
  scheduledAt: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  localDate: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  localTime: string;
}

export class ExtractedReminderUpdateDto {
  @IsString()
  @MaxLength(128)
  reminderKey: string;

  @IsIn(['cancelled'])
  status: 'cancelled';
}

export class ApplyReminderExtractionDto {
  @IsIn(['entry', 'checkin', 'entry_dialog', 'checkin_dialog'])
  sourceType: 'entry' | 'checkin' | 'entry_dialog' | 'checkin_dialog';

  @IsString()
  @MaxLength(128)
  sourceId: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  sourceDate?: string;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  sourceEntryKind?: string;

  @IsString()
  @MaxLength(64)
  timezone: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedScheduledReminderDto)
  reminders: ExtractedScheduledReminderDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedReminderUpdateDto)
  @IsOptional()
  updates?: ExtractedReminderUpdateDto[];
}
