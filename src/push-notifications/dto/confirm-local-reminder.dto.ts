import { IsString, MaxLength } from 'class-validator';

export class ConfirmLocalReminderDto {
  @IsString()
  @MaxLength(255)
  notificationId: string;
}
