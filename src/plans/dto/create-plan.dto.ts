import { IsNumber, IsString } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: 'Start' | 'Lite' | 'Base' | 'Pro';

  @IsNumber()
  price: number;

  @IsNumber()
  tokensLimit: number;
}
