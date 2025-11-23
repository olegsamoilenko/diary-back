import { IsArray } from 'class-validator';

export class MarkAsReadDto {
  @IsArray()
  ids: number[];
}
