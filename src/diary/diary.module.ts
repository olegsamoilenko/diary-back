import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from './entities/diary.entity';
import { DiaryEntryDialog } from './entities/dialog.entity';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from 'src/users/users.module';
import { DiaryEntrySetting } from './entities/setting.entity';
import { KmsModule } from 'src/kms/kms.module';
import { EntryImage } from './entities/entry-image.entity';
import { EntryImagesService } from './entry-images.service';
import { EntryImagesController } from './entry-images.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntry]),
    TypeOrmModule.forFeature([DiaryEntrySetting]),
    TypeOrmModule.forFeature([DiaryEntryDialog]),
    TypeOrmModule.forFeature([EntryImage]),
    forwardRef(() => AiModule),
    forwardRef(() => UsersModule),
    KmsModule,
  ],
  providers: [DiaryService, EntryImagesService],
  controllers: [DiaryController, EntryImagesController],
  exports: [DiaryService, EntryImagesService],
})
export class DiaryModule {}
