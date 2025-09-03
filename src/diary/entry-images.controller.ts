import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EntryImagesService } from './entry-images.service';
import { UpsertEntryImagesDto } from './dto/upsert-entry-images.dto';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('entry-images')
export class EntryImagesController {
  constructor(private entryImagesService: EntryImagesService) {}

  @Post(':entryId')
  async upsert(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: UpsertEntryImagesDto,
  ) {
    const res = await this.entryImagesService.upsertMany(entryId, dto);
    return { items: res };
  }

  @Get(':entryId')
  async list(@Param('entryId', ParseIntPipe) entryId: number) {
    const items = await this.entryImagesService.list(entryId);
    return { items };
  }
}
