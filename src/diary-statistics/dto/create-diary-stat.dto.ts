import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDiaryStatDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(/^\S+$/)
  entryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(/^\S+$/)
  aiTraceId?: string;

  @IsOptional()
  @IsBoolean()
  aiRequested?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  checkinName?: string | null;
}
