import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PushOwnershipProof {
  @IsInt() @Min(1) userId: number;
  @IsString() @MaxLength(64) deviceId: string;
  @IsString() @MaxLength(64) publicKey: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) revision: number;
  @IsString() @MaxLength(128) signature: string;
}

export class RevokePushDeviceDto {
  @ValidateNested()
  @Type(() => PushOwnershipProof)
  ownership: PushOwnershipProof;
  @IsOptional() @IsString() @MaxLength(512) token?: string;
}
