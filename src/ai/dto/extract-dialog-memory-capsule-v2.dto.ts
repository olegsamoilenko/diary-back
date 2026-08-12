import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ActiveMemoryCommitmentV2Dto,
  ActiveScheduledReminderV2Dto,
} from './extract-assistant-memory-capsule-v2.dto';

export class ExtractDialogMemoryCapsuleV2Dto {
  @IsString()
  @IsIn(['dialog'])
  @IsOptional()
  sourceType?: 'dialog';

  @IsString()
  @IsIn(['dialog', 'checkin_dialog'])
  @IsOptional()
  reviewSourceType?: 'dialog' | 'checkin_dialog';

  @IsString()
  userText!: string;

  @IsString()
  assistantText!: string;

  @IsObject()
  @IsOptional()
  personalTagCatalog?: Record<string, unknown>;

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
