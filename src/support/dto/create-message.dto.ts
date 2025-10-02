import { IsEmail, IsEnum, IsString } from 'class-validator';
import { SupportMessageCategory } from '../types/';

export class CreateMessageDto {
  @IsEmail()
  readonly email: string;

  @IsEnum(SupportMessageCategory)
  category: SupportMessageCategory;

  @IsString()
  title: string;

  @IsString()
  text: string;
}
