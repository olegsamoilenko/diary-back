import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { EntryImageItemDto } from './entry-image-item.dto';

export class UpsertEntryImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntryImageItemDto)
  items!: EntryImageItemDto[];
}
