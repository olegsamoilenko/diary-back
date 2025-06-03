import { IsEmail, IsString } from 'class-validator';

export class ResetPasswordDTO {
  @IsEmail()
  readonly email: string;

  @IsString()
  lang: string;
}
