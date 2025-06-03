import { IsEmail, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  readonly email: string;

  @IsString()
  password: string;

  @IsString()
  emailVerificationToken: string;
}
