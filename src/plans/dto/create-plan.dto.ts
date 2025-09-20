import {
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';

export class CreatePlanDto {
  @IsString()
  subscriptionId: SubscriptionIds;

  @IsString()
  platformPlanId: PlanIds;

  @IsDate()
  startTime: Date;

  @IsOptional()
  @IsDate()
  expiryTime: Date;

  @IsString()
  planStatus: PlanStatus;

  @IsBoolean()
  autoRenewEnabled: boolean;

  @IsOptional()
  @IsString()
  purchaseToken: string;

  @IsString()
  platform: Platform;

  @IsOptional()
  @IsString()
  regionCode: string | null;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency: string;
}
