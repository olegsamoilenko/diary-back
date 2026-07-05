import { IsOptional, IsString } from 'class-validator';

export class SubscribeGooglePlayDto {
  @IsString()
  packageName!: string;

  @IsString()
  purchaseToken!: string;

  @IsOptional()
  @IsString()
  obfuscatedAccountId?: string | null;
}
