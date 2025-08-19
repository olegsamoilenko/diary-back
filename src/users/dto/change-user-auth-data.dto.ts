import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { passRegex } from '../../auth/constants';

export class ChangeUserAuthDataDto {
  @IsEmail()
  readonly email: string;

  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly password: string;

  @IsOptional()
  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly newPassword: string;

  @IsOptional()
  @IsEmail()
  readonly newEmail?: string;

  @IsOptional()
  @IsString()
  lang?: string;
}
