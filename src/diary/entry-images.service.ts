import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntryImage } from './entities/entry-image.entity';
import { UpsertEntryImagesDto } from './dto/upsert-entry-images.dto';

@Injectable()
export class EntryImagesService {
  constructor(
    @InjectRepository(EntryImage)
    private entryImageRepository: Repository<EntryImage>,
  ) {}

  async upsertMany(entryId: number, dto: UpsertEntryImagesDto) {
    const now = new Date();
    const rows: Partial<EntryImage>[] = dto.items.map((i) => ({
      entryId,
      imageId: i.imageId,
      filename: i.filename,
      sha256: i.sha256,
      fileSize: i.fileSize,
      width: i.width,
      height: i.height,
      capturedAt: i.capturedAt ? new Date(i.capturedAt) : undefined,
      assetId: i.assetId,
      createdAt: now,
    }));

    await this.entryImageRepository
      .createQueryBuilder()
      .insert()
      .into(EntryImage)
      .values(rows)
      .orUpdate(
        [
          'filename',
          'sha256',
          'fileSize',
          'width',
          'height',
          'capturedAt',
          'assetId',
        ],
        ['entryId', 'imageId'],
        { skipUpdateIfNoValuesChanged: true },
      )
      .execute();

    return this.entryImageRepository.find({ where: { entryId } });
  }

  async list(entryId: number) {
    return this.entryImageRepository.find({ where: { entryId } });
  }

  async deleteImages(images: EntryImage[]) {
    return await this.entryImageRepository.remove(images);
  }
}
