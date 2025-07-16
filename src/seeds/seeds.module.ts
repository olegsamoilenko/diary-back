import { Module } from '@nestjs/common';
import { SeedsController } from './seeds.controller';
import { SeedsService } from './seeds.service';
import { DiaryModule } from 'src/diary/diary.module';
import { AiModule } from 'src/ai/ai.module';
import { PlansModule } from 'src/plans/plans.module';
import { UsersModule } from 'src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from '../diary/entities/diary.entity';
import { DiaryEntryDialog } from '../diary/entities/dialog.entity';
import { AiComment } from '../ai/entities/aiComments.entity';
import { AIAnswer } from '../ai/entities/dialog.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntry]),
    TypeOrmModule.forFeature([DiaryEntryDialog]),
    TypeOrmModule.forFeature([AiComment]),
    TypeOrmModule.forFeature([AIAnswer]),
    DiaryModule,
    AiModule,
    PlansModule,
    UsersModule,
  ],
  providers: [SeedsService],
  controllers: [SeedsController],
  exports: [],
})
export class SeedsModule {}
