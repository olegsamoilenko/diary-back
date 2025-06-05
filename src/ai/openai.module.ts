import { Module } from '@nestjs/common';
import { OpenAIService } from './openai.service';

@Module({
  imports: [],
  providers: [OpenAIService],
  controllers: [],
  exports: [OpenAIService],
})
export class OpenAIModule {}
