import { IsEmail, IsString, Matches } from 'class-validator';
import { passRegex } from 'src/auth/constants/';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDTO {
  @IsString()
  uuid: string;

  @ApiProperty({ example: 'oleg@email.com', description: 'Електронна пошта' })
  @IsEmail()
  readonly email: string;

  @Matches(passRegex, '', {
    message:
      'Your password must be 8 or more characters, contain at least one uppercase, one lowercase, one symbol, and one number.',
  })
  readonly password: string;

  @IsString()
  lang: string;
}
