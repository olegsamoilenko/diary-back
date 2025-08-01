import { IsString } from 'class-validator';
import { Plans } from '../types/plans';

export class CreatePlanDto {
  @IsString()
  name: Plans;
}
