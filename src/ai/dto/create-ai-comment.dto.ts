import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { TiktokenModel } from 'tiktoken';

export class CreateAiCommentDto {
  @IsString()
  content: string;

  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  embedding: number[];

  @IsString()
  aiModel: TiktokenModel;

  @IsString()
  @IsOptional()
  mood: string;
}
