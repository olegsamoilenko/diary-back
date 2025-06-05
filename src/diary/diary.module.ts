import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from './entities/diary.entity';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { OpenAIModule } from '../ai/openai.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([DiaryEntry]), OpenAIModule, UsersModule],
  providers: [DiaryService],
  controllers: [DiaryController],
  exports: [],
})
export class DiaryModule {}
