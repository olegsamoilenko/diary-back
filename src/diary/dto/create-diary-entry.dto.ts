import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { TiktokenModel } from 'tiktoken';

export class CreateDiaryEntryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsString()
  aiModel: TiktokenModel;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
