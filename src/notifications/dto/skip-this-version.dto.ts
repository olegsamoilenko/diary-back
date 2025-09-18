import { IsNumber, IsString } from 'class-validator';
import { Platform } from 'src/common/types/platform';

export class SkipThisVersionDto {
  @IsString()
  platform: Platform;

  @IsNumber()
  build: number;
}
