import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateForumCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;

  @IsOptional()
  @IsUUID()
  replyToCommentId?: string;
}
