import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ForumTopicType } from '../types/forum-topic-type.enum';
import { ForumTopicVisibility } from '../types/forum-topic-visibility.enum';

export class CreateForumTopicDto {
  @IsUUID()
  categoryId: string;

  @IsEnum(ForumTopicType)
  type: ForumTopicType;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsEnum(ForumTopicVisibility)
  visibility?: ForumTopicVisibility;
}
