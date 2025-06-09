import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiComment } from './entities/aiComments.entity';
import { DiaryModule } from 'src/diary/diary.module';
import { AiController } from './ai.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiComment]),
    forwardRef(() => DiaryModule),
  ],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
