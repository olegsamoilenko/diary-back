import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ExtractUserMemoryDto {
  @IsString()
  text!: string;

  @IsNumber()
  @IsOptional()
  maxLength?: number;

  @IsNumber()
  @IsOptional()
  maxTextChars?: number;
}
