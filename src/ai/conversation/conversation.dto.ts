import { Type } from 'class-transformer';
import {
  ActiveMemoryCommitmentV2Dto,
  ActiveScheduledReminderV2Dto,
} from '../dto/extract-assistant-memory-capsule-v2.dto';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ConversationTurnDto {
  @IsString() @MaxLength(4000) question!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  mediaIds?: string[];
  @IsString() @MinLength(1) answer!: string;
  @IsISO8601() createdAt!: string;
}

/** Conversation history plus shared actions; no diary/profile or general memory. */
export class ConversationDto {
  @IsOptional() @IsBoolean() imageGenerationSupported?: boolean;
  @IsOptional() @IsBoolean() completeHistory?: boolean;
  @IsOptional() @IsString() @MaxLength(1500000) dialogContext?: string;
  @IsOptional() @IsISO8601() contextCreatedAt?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveMemoryCommitmentV2Dto)
  activeCommitments?: ActiveMemoryCommitmentV2Dto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveScheduledReminderV2Dto)
  activeScheduledReminders?: ActiveScheduledReminderV2Dto[];

  @IsInt() @Min(1) expectedUserId!: number;
  @IsUUID() conversationId!: string;
  @IsUUID() requestId!: string;
  @IsString() @MaxLength(4000) question!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  mediaIds?: string[];
  @IsString() @MaxLength(100) timezone!: string;
  @IsISO8601() createdAt!: string;
  @IsInt() @Min(0) omittedTurns!: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  history!: ConversationTurnDto[];
}
