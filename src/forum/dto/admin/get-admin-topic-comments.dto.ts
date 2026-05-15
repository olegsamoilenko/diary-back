import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetAdminTopicCommentsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value || 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value || 20))
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;

  /**
   * Для першого підвантаження з селекта:
   * all | 5 | 10 | 20 | 50
   */
  @IsOptional()
  @IsIn(['all', '5', '10', '20', '50'])
  take?: 'all' | '5' | '10' | '20' | '50';
}
