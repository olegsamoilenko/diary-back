import { IsArray, IsNumber, IsString } from 'class-validator';

export class CreateAiCommentDto {
  @IsString()
  content: string;

  @IsArray()
  @IsNumber({}, { each: true })
  embedding: number[];

  @IsString()
  aiModel: string;

  @IsNumber()
  mood: number;
}
