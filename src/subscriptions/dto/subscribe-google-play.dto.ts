import { IsString } from 'class-validator';

export class SubscribeGooglePlayDto {
  @IsString()
  packageName!: string;

  @IsString()
  purchaseToken!: string;
}
