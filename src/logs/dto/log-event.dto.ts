import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class DeviceDto {
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() os?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() locale?: string;
}

class AppDataDto {
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() appBuild?: string;
}

export class LogEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ts!: number;

  @IsIn(['info', 'warn', 'error'])
  level!: 'info' | 'warn' | 'error';

  @IsOptional()
  @IsIn(['frontend', 'backend'])
  source?: 'frontend' | 'backend';

  @IsIn(['app', 'ui', 'query', 'mutation', 'perf', 'iap', 'ai', 'error'])
  kind!: 'app' | 'ui' | 'query' | 'mutation' | 'perf' | 'iap' | 'ai' | 'error';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  userId?: number | string | null;

  @IsOptional()
  userUuid?: string | null;

  @IsOptional()
  @IsObject()
  appData?: AppDataDto;

  @IsOptional()
  @IsObject()
  device?: DeviceDto;

  @IsOptional()
  data?: unknown;

  @ValidateIf((o) => o.requestId !== undefined)
  @IsString()
  requestId?: string;
}
