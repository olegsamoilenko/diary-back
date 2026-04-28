import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockForumUserDto {
  @IsInt()
  blockedUserId: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
