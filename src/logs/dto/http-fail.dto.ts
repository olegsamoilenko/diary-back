import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ServerAppDataDto {
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() appBuild?: string;
  @IsOptional() @IsString() platform?: string;
}

export class ServerHttpFailDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ts!: number;

  @IsIn(['warn', 'error'])
  level!: 'warn' | 'error';

  @IsOptional()
  @IsIn(['http'])
  kind?: 'http';

  @Type(() => Number)
  @IsInt()
  @Min(400)
  @Max(599)
  status!: number;

  @IsString()
  @IsNotEmpty()
  method!: string;

  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsOptional()
  query?: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  userId?: number | string | null;

  @IsOptional()
  userUuid?: string | null;

  @ValidateIf((o) => o.requestId !== undefined)
  @IsString()
  requestId?: string;

  @IsOptional() @IsString() ip?: string;
  @IsOptional() @IsString() ua?: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() referer?: string;

  @IsOptional() @IsString() errorName?: string;
  @IsOptional() @IsString() errorMessage?: string;
  @IsOptional() @IsString() stack?: string;

  @IsOptional()
  @IsObject()
  appData?: ServerAppDataDto;

  @IsOptional()
  meta?: unknown;
}
