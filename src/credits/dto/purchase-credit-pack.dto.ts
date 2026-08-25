import { IsOptional, IsString } from 'class-validator';

export class PurchaseCreditPackDto {
  @IsString()
  packageName!: string;

  @IsString()
  purchaseToken!: string;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsString()
  obfuscatedAccountId?: string | null;
}
