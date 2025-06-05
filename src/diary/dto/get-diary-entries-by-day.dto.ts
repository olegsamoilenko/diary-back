import { IsNumber, IsString } from 'class-validator';

export class GetDiaryEntriesByDayDto {
  @IsString()
  date: string;

  @IsNumber()
  offsetMinutes: number;
}
