import { IsString } from 'class-validator';

export class GetDiaryEntriesByDayDto {
  @IsString()
  date: string;

  @IsString()
  timeZone: string;
}
