import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Platform } from 'src/common/types/platform';

export class SubscriptionsBootstrapDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  appBuild?: number;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;
}
