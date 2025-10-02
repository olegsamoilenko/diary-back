import { IsEmail, Matches, IsString } from 'class-validator';
import { passRegex } from 'src/auth/constants/';

export class LoginDTO {
  @IsEmail()
  readonly email: string;

  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly password: string;

  @IsString()
  readonly uuid: string;

  @IsString()
  readonly deviceId?: string;

  @IsString()
  readonly devicePubKey?: string;
}
