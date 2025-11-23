import { Locale } from 'src/common/types/locale';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Json } from 'src/common/types/json';

class TranslationItemDto {
  @IsString()
  locale!: Locale;

  @IsString()
  html!: string;

  @IsOptional()
  docJson?: Json;
}

export class CreateCommonNotificationDto {
  @IsString()
  defaultLocale!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationItemDto)
  translations!: TranslationItemDto[];
}
