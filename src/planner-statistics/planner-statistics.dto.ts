import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PLANNER_TYPES = [
  'goal',
  'habit',
  'checklist',
  'task',
  'event',
  'reminder',
  'note',
] as const;

export type PlannerType = (typeof PLANNER_TYPES)[number];

export class PlannerEntityStatDto {
  @IsIn(PLANNER_TYPES)
  type: PlannerType;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  entityId: string;
}

export class CreatePlannerStatDto {
  @IsIn(PLANNER_TYPES)
  type: PlannerType;

  // Older clients report only a type. New clients supply the local ID so a
  // repeated request cannot count the same creation twice.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  entityId?: string;
}
