import { IsNumber } from 'class-validator';

export class GetMoodsByDateDto {
  @IsNumber()
  month: number;

  @IsNumber()
  year: number;

  @IsNumber()
  offsetMinutes: number;
}
