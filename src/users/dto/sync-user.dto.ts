import { Transform } from 'class-transformer';
import { Allow, IsString, Matches } from 'class-validator';
import { Platform } from '../../common/types/platform';

export class SyncUserDto {
  // Preserve the wire type even with enableImplicitConversion in main.ts.
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsString()
  @Matches(/\S/, { message: 'purchaseToken must be a non-empty string' })
  purchaseToken: string;

  // Keep the released device-metadata contract; service validates the key.
  @Allow()
  devicePubKey: string;

  @Allow()
  deviceId?: string | null;

  @Allow()
  appVersion: string;

  @Allow()
  appBuild: number;

  @Allow()
  platform: Platform;

  @Allow()
  model: string;

  @Allow()
  osVersion: string;

  @Allow()
  osBuildId: string;

  @Allow()
  uniqueId: string | null;
}
