import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PushOwnershipProof } from './push-ownership.dto';

export class SavePushTokenDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PushOwnershipProof)
  ownership?: PushOwnershipProof;

  @IsString()
  token: string;

  @IsIn(['ios', 'android', 'windows', 'macos', 'web'])
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'web';

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
