import { IsInt } from 'class-validator';

export class UnrestrictForumUserDto {
  @IsInt()
  createdByAdminId: number;
}
