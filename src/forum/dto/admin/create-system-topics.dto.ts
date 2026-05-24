import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ForumTopicType } from '../../types/forum-topic-type.enum';
import { ForumCategorySlug } from '../../types/forum-category-slug.enum';
import { Type } from 'class-transformer';

export class CreateSystemTopicTranslationDto {
  @IsString()
  lang: string;

  @IsString()
  title: string;

  @IsString()
  content: string;
}

export class CreateSystemTopicsDto {
  @IsNumber()
  userId: number;

  @IsEnum(ForumTopicType)
  type: ForumTopicType;

  @IsEnum(ForumCategorySlug)
  categorySlug: ForumCategorySlug;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSystemTopicTranslationDto)
  topics: CreateSystemTopicTranslationDto[];
}
