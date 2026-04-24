import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ModelReviewService } from './model-review.service';
import { AiModelAnswerReview } from './entities/ai-model-answer-review.entity';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('model-review')
export class ModelReviewController {
  constructor(private readonly modelReviewService: ModelReviewService) {}

  @Get('get-ai-model-answer-reviews')
  async getAiModelAnswerReviews(): Promise<AiModelAnswerReview[]> {
    return await this.modelReviewService.getAiModelAnswerReviews();
  }

  @Post('mark-as-read-ai-model-answer-review')
  async markAsReadAiModelAnswerReview(
    @Body() body: { id: number },
  ): Promise<boolean> {
    return await this.modelReviewService.markAsReadAiModelAnswerReview(body.id);
  }
}
