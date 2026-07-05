import { IsBoolean, IsOptional } from 'class-validator';

export class EnsureInitialSubscriptionStateDto {
  @IsOptional()
  @IsBoolean()
  isFirstInstall?: boolean;
}
