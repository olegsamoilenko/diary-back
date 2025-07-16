import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiComment } from './entities/aiComments.entity';
import { DiaryModule } from 'src/diary/diary.module';
import { AiController } from './ai.controller';
import { UsersModule } from 'src/users/users.module';
import { AIAnswer } from './entities/dialog.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiComment]),
    TypeOrmModule.forFeature([AIAnswer]),
    forwardRef(() => DiaryModule),
    UsersModule,
  ],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
