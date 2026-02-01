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

export class ChangePlanDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsBoolean()
  actual: boolean;
}
