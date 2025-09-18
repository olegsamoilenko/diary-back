import { Locale } from 'src/common/types/locale';

import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Json } from 'src/common/types/json';
import { Platform } from '../../common/types/platform';

class TranslationItemDto {
  @IsString()
  locale!: Locale;

  @IsString()
  html!: string;

  @IsOptional()
  docJson?: Json;
}

export class CreateReleaseNotificationDto {
  @IsString()
  defaultLocale!: string;

  @IsString()
  platform: Platform;

  @IsNumber()
  build: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationItemDto)
  translations!: TranslationItemDto[];
}
