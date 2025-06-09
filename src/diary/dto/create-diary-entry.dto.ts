import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDiaryEntryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  mood?: number;

  @IsOptional()
  @IsString()
  aiModel: string;
}
