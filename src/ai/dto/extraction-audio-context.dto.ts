import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExtractionAudioTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(60000) text!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
}

export class ExtractionAudioContextDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  currentIds!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExtractionAudioTurnDto)
  history!: ExtractionAudioTurnDto[];
}

export class WithExtractionAudioContextDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractionAudioContextDto)
  audioContext?: ExtractionAudioContextDto;
}
