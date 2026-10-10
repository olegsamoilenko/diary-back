import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RefreshTokenDto {
  @IsInt()
  @Type(() => Number)
  userId!: number;

  @IsUUID()
  deviceId!: string;

  @IsString()
  refreshToken!: string;

  // Optional for released clients. New clients persist this before rotating.
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  nextRefreshToken?: string;

  @IsNumber()
  @Type(() => Number)
  ts!: number;

  @IsString()
  sig!: string;
}
