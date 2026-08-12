import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ExtractUserMemoryCapsuleV2Dto {
  @IsString()
  text!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  title?: string;

  @IsIn(['entry', 'checkin'])
  sourceType!: 'entry' | 'checkin';

  @IsObject()
  @IsOptional()
  personalTagCatalog?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  structuredContext?: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  maxTextChars?: number;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  contentHash?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  timingTraceId?: string;
}
