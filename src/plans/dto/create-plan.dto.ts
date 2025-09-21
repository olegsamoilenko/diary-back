import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PlanStatus, SubscriptionIds, BasePlanIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsEnum(SubscriptionIds)
  subscriptionId: SubscriptionIds;

  @IsEnum(BasePlanIds)
  basePlanId: BasePlanIds;

  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryTime?: Date | null;

  @IsEnum(PlanStatus)
  planStatus: PlanStatus;

  @IsBoolean()
  autoRenewEnabled: boolean;

  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  linkedPurchaseToken?: string | null;

  @IsEnum(Platform)
  platform: Platform;

  @IsOptional()
  @IsString()
  regionCode?: string | null;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
