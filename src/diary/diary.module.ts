import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryEntry } from './entities/diary.entity';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntry]),
    forwardRef(() => AiModule),
    UsersModule,
  ],
  providers: [DiaryService],
  controllers: [DiaryController],
  exports: [DiaryService],
})
export class DiaryModule {}
