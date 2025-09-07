import { IsEmail, IsString } from 'class-validator';

export class ChangePasswordDTO {
  @IsEmail()
  readonly email: string;

  @IsString()
  code: string;

  @IsString()
  readonly password: string;
}
