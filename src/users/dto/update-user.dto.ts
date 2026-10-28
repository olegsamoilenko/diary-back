import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// Public profile edits only. Auth flows and administrative role changes use
// the trusted UsersService.update contract separately.
export class UpdateUserDto {
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsISO8601({ strict: true })
  lastActiveAt?: string;

  // Retained for older clients; the service keeps the legacy/V2 sync policy.
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsBoolean()
  usesWithoutSubscription?: boolean;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  appVersion?: string;

  // Expo environment variables are sent as strings by released clients.
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => {
    const value = (obj as Record<string, unknown>)[key];
    return typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : value;
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  appBuild?: number;
}
