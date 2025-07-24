import { IsEmail, IsString } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  readonly email: string;

  @IsString()
  password: string;

  @IsString()
  emailVerificationCode: string;
}
