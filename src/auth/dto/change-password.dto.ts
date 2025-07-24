import { IsString } from 'class-validator';

export class ChangePasswordDTO {
  @IsString()
  code: string;

  @IsString()
  readonly password: string;
}
