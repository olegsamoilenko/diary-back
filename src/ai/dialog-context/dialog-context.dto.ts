import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CompressDialogContextDto {
  @IsInt() @Min(1) expectedUserId!: number;
  @IsUUID() requestId!: string;
  @IsString() @MaxLength(1500000) source!: string;
  @IsString() @MaxLength(1500000) retainedHistory!: string;
}
