import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ForumTopicsSort } from '../types/forum-topics-sort.enum';
import { ForumShowTopics } from '../types/forum-show-topics.enum';

export class GetForumTopicsDto {
  @IsArray()
  categories: string[];

  @IsString()
  sort: ForumTopicsSort;

  @IsString()
  showTopics: ForumShowTopics;
}
