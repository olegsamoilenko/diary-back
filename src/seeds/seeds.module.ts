import { Module } from '@nestjs/common';
import { SeedsController } from './seeds.controller';
import { SeedsService } from './seeds.service';
import { DiaryModule } from 'src/diary/diary.module';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [DiaryModule, AiModule],
  providers: [SeedsService],
  controllers: [SeedsController],
  exports: [],
})
export class SeedsModule {}
