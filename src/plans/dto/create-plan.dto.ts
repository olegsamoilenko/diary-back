import {
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PlanStatus, SubscriptionIds, BasePlanIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';

export class CreatePlanDto {
  @IsString()
  subscriptionId: SubscriptionIds;

  @IsString()
  basePlanId: BasePlanIds;

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

  @IsString()
  regionCode: string | null;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency: string;
}
