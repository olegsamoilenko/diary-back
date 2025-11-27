import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ExtractAssistantMemoryDto {
  @IsString()
  text!: string;

  @IsNumber()
  @IsOptional()
  maxLongTerm?: number;

  @IsNumber()
  @IsOptional()
  maxCommitments?: number;

  @IsNumber()
  @IsOptional()
  maxTextChars?: number;
}
