import { IsInt, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDeviceKeyDto {
  @IsInt()
  @Type(() => Number)
  userId!: number;

  @IsUUID()
  deviceId!: string;

  @IsString()
  devicePubKey!: string;
}
