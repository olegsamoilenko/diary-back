import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { FinancePeriod } from '../types/';

export class GetFinanceStatisticsQuery {
  @IsEnum(FinancePeriod)
  period: FinancePeriod;

  @ValidateIf((o: { period: FinancePeriod }) => o.period !== FinancePeriod.ALL)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  periodsCount: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string;
}
