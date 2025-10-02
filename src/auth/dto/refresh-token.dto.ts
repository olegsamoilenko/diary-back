import { IsInt, IsNumber, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class RefreshTokenDto {
  @IsInt()
  @Type(() => Number)
  userId!: number;

  @IsUUID()
  deviceId!: string;

  @IsString()
  refreshToken!: string;

  @IsNumber()
  @Type(() => Number)
  ts!: number;

  @IsString()
  sig!: string;
}
