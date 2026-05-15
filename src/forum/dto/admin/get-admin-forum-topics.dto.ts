import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetAdminForumTopicsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value || 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value || 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(['createdAt', 'lastActivityAt'])
  sort: 'createdAt' | 'lastActivityAt' = 'lastActivityAt';
}
