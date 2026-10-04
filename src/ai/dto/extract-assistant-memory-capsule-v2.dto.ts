import {
  IsArray,
  IsBoolean,
  IsIn,
  MaxLength,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActiveMemoryCommitmentV2Dto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  key!: string;

  @IsString()
  @IsOptional()
  kind?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  text!: string;

  @IsNumber()
  @IsOptional()
  importance?: number;

  @IsString()
  @IsIn(['ongoing', 'one_time'])
  @IsOptional()
  duration?: 'ongoing' | 'one_time';

  @IsString()
  @IsIn(['open'])
  status!: 'open';

  @IsArray()
  @IsString({ each: true })
  triggerTags!: string[];

  @IsNumber()
  @IsOptional()
  createdAt?: number;
}

export class ActiveScheduledReminderV2Dto {
  @IsString()
  reminderKey!: string;

  @IsString()
  text!: string;

  @IsString()
  localDate!: string;

  @IsString()
  localTime!: string;
}

export class ExtractAssistantMemoryCapsuleV2Dto {
  /** Optional compact period-discussion update; data only, never a source of reminder actions. */
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  periodMemoryContext?: string;

  @IsOptional()
  @IsBoolean()
  actionsOnly?: boolean;
  /** Source timestamp, independent of generation/reminder scheduling time. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceAt?: string;

  @IsString()
  text!: string;

  @IsString()
  @IsIn(['entry', 'checkin', 'dialog'])
  @IsOptional()
  sourceType?: 'entry' | 'checkin' | 'dialog';

  @IsString()
  @IsOptional()
  userText?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveMemoryCommitmentV2Dto)
  @IsOptional()
  activeCommitments?: ActiveMemoryCommitmentV2Dto[];

  @IsNumber()
  @IsOptional()
  maxTextChars?: number;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  timingTraceId?: string;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  currentLocalDate?: string;

  @IsString()
  @MaxLength(5)
  @IsOptional()
  currentLocalTime?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  timezone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveScheduledReminderV2Dto)
  @IsOptional()
  activeScheduledReminders?: ActiveScheduledReminderV2Dto[];
}
