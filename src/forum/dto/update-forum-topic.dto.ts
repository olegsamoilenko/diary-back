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

export class UpdateForumTopicDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ForumTopicType)
  type?: ForumTopicType;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsEnum(ForumTopicVisibility)
  visibility?: ForumTopicVisibility;
}
