import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { CreateAiCommentDto } from './dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}
  @Post('generate-comment')
  async createAiComment(
    @Body() data: { entryId: number; data: CreateAiCommentDto },
  ) {
    // return true;
    return this.aiService.createAiComment(data.entryId, data.data);
  }
}
