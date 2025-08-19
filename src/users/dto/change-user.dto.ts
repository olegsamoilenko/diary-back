import { IsOptional, IsString } from 'class-validator';

export class ChangeUserDto {
  @IsString()
  readonly uuid: string;

  @IsString()
  readonly hash?: string;

  @IsOptional()
  @IsString()
  readonly newName?: string;
}
