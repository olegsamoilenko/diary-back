import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAiCommentDto {
  @IsString()
  content: string;

  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  embedding: number[];

  @IsString()
  aiModel: string;

  @IsString()
  @IsOptional()
  mood: string;
}
