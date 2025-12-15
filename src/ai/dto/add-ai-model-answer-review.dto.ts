import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { UnhelpfulAnswerDescription } from '../types/unhelpfulAnswerDescription';
import { AiModel } from '../../users/types';

export class AddAiModelAnswerReviewDto {
  @IsBoolean()
  isHelpful: boolean;

  @IsArray()
  @IsOptional()
  unhelpfulAnswerDescriptions: UnhelpfulAnswerDescription[];

  @IsString()
  @IsOptional()
  unhelpfulComment: string;

  @IsString()
  @IsOptional()
  improvementComment: string;

  @IsString()
  aiModel: AiModel;
}
