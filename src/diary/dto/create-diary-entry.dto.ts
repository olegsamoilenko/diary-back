import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

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
  aiModel: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
