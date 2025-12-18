import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { UnhelpfulAnswerDescription } from '../types/unhelpfulAnswerDescription';
import { AiModel } from '../../users/types';

export class AddPositiveNegativeAiModelAnswerDto {
  @IsString()
  attitude: 'positive' | 'negative';

  @IsString()
  type: string;

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
