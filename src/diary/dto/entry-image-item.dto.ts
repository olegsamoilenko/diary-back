import {
  IsInt,
  IsOptional,
  IsString,
  IsNumberString,
  IsDateString,
} from 'class-validator';

export class EntryImageItemDto {
  @IsString()
  imageId!: string;

  @IsString()
  filename!: string;

  @IsString()
  sha256!: string;

  @IsNumberString()
  fileSize!: string;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsString()
  assetId?: string;
}
