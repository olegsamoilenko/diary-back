import { IsNumber } from 'class-validator';

export class GetLatestCommonNotificationDto {
  @IsNumber()
  id: number;
}
