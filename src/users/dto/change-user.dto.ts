import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { passRegex } from '../../auth/constants';

export class ChangeUserDto {
  @IsEmail()
  readonly email: string;

  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly password: string;

  @IsOptional()
  @IsString()
  readonly newName?: string;

  @IsOptional()
  @IsEmail()
  readonly newEmail?: string;

  @IsOptional()
  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly newPassword?: string;
}
