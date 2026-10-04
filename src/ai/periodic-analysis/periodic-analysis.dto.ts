import { ActiveMemoryCommitmentV2Dto } from '../dto/extract-assistant-memory-capsule-v2.dto';
import {
  IsArray,
  IsBoolean,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { LocalAnalysisReport } from './periodic-analysis.service';

export type AnalysisKind = 'day' | 'week' | 'month' | 'year';

export class PreviousAnalysisDto {
  @IsIn(['day', 'week', 'month', 'year']) kind!: AnalysisKind;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end!: string;
  @IsString() @MaxLength(100) timezone!: string;
  @IsISO8601() createdAt!: string;
  @IsString() capsule!: string;
}

export class AnalysisCreationTimeDto {
  @IsOptional() @IsBoolean() imageGenerationSupported?: boolean;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  createdAt?: string;
}

export class PeriodicAnalysisDto extends AnalysisCreationTimeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveMemoryCommitmentV2Dto)
  activeCommitments?: ActiveMemoryCommitmentV2Dto[];
  @IsInt() @Min(1) expectedUserId!: number;
  @IsUUID() requestId!: string;
  @IsIn(['day', 'week', 'month', 'year']) kind!: AnalysisKind;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end!: string;
  @IsString() @MaxLength(100) timezone!: string;
  @IsISO8601() asOf!: string;
  @IsInt() @Min(0) @Max(6) firstDayOfWeek!: number;
  @IsObject() snapshot!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PreviousAnalysisDto)
  previousAnalyses?: PreviousAnalysisDto[];
}

export class AnalysisDialogDto extends AnalysisCreationTimeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveMemoryCommitmentV2Dto)
  activeCommitments?: ActiveMemoryCommitmentV2Dto[];
  @IsInt() @Min(1) expectedUserId!: number;
  @IsUUID() requestId!: string;
  @IsString() @MaxLength(4000) question!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  mediaIds?: string[];
  @IsOptional() @IsObject() report?: LocalAnalysisReport;
}

export class PeriodicAnalysisDialogDto extends AnalysisDialogDto {
  @IsUUID() reportId!: string;
}
