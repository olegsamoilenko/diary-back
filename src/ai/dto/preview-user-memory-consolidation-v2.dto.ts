import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UserMemoryConsolidationCandidateV2Dto {
  @IsString()
  @MaxLength(128)
  id!: string;

  @IsString()
  @MaxLength(64)
  kind!: string;

  @IsString()
  @MaxLength(64)
  topic!: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  importance!: number;

  @IsString()
  @MaxLength(64)
  sourceType!: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  sourceId?: string;

  @IsInt()
  @Min(0)
  createdAt!: number;

  @IsIn(['atomic', 'consolidated'])
  @IsOptional()
  memoryForm?: 'atomic' | 'consolidated';

  @IsIn(['active', 'absorbed', 'superseded'])
  @IsOptional()
  memoryState?: 'active' | 'absorbed' | 'superseded';

  @IsInt()
  @Min(0)
  @IsOptional()
  firstSeenAt?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  lastSeenAt?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  occurrenceCount?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  evidenceCount?: number;

}

export class PreviewUserMemoryConsolidationV2Dto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UserMemoryConsolidationCandidateV2Dto)
  items!: UserMemoryConsolidationCandidateV2Dto[];

  @IsString()
  @MaxLength(128)
  @IsOptional()
  timingTraceId?: string;

  @IsIn(['entry', 'checkin'])
  @IsOptional()
  triggerSourceType?: 'entry' | 'checkin';

  @IsString()
  @MaxLength(128)
  @IsOptional()
  triggerSourceId?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  parentTimingTraceId?: string;
}
