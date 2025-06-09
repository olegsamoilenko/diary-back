import { IsNumber, IsString } from 'class-validator';

export class CreateAiCommentDto {
  @IsString()
  content: string;

  @IsString()
  aiModel: string;

  @IsNumber()
  mood: number;
}
