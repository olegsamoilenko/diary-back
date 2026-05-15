import { IsIn, IsOptional, IsString } from 'class-validator';

export class SavePushTokenDto {
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
