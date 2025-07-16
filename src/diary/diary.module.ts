import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from './entities/diary.entity';
import { DiaryEntryDialog } from './entities/dialog.entity';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from 'src/users/users.module';
import { DiaryEntrySetting } from './entities/setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntry]),
    TypeOrmModule.forFeature([DiaryEntrySetting]),
    TypeOrmModule.forFeature([DiaryEntryDialog]),
    forwardRef(() => AiModule),
    UsersModule,
  ],
  providers: [DiaryService],
  controllers: [DiaryController],
  exports: [DiaryService],
})
export class DiaryModule {}
