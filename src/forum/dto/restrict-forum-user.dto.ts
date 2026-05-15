import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ForumUserRestrictionType } from '../types/forum-user-restriction-type.enum';

export class RestrictForumUserDto {
  @IsEnum(ForumUserRestrictionType)
  type: ForumUserRestrictionType;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsInt()
  violationCount: number;

  @IsInt()
  createdByAdminId: number;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}
