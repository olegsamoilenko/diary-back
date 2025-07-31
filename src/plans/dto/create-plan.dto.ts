import { IsNumber, IsString } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: 'Start' | 'Lite' | 'Base' | 'Pro';
}
