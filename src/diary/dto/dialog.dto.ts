import { IsNumber, IsString } from 'class-validator';

export class DialogDto {
  @IsString()
  question: string;

  @IsNumber()
  entryId: number;
}
