import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { CreateAiCommentDto } from './dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { PlanGuard } from './guards/plan.guard';
import { TiktokenModel } from 'tiktoken';
import { ExtractUserMemoryDto } from './dto';
import { ProposedMemoryItem } from './types';
import { ExtractAssistantMemoryDto } from './dto/extract-assistant-memory.dto';
import { ExtractAssistantMemoryResponse } from './types/assistantMemory';
import { AiModel } from 'src/users/types';
import { AddAiModelAnswerReviewDto } from './dto/add-ai-model-answer-review.dto';
import { AddPositiveNegativeAiModelAnswerDto } from './dto/add-positive-negative-ai-model-answer.dto';
import { JwtAuthGuard } from 'src/auth/strategies/JwtAuthGuard';

@UseGuards(AuthGuard('jwt'), PlanGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('preflight')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async aiPreflight(@Body() body: { aiModel?: AiModel }) {
    return { ok: true, aiModel: body?.aiModel ?? null };
  }

  @Post('generate-embeddings')
  async generateEmbeddings(
    @ActiveUserData() user: ActiveUserDataT,
    @Body()
    body: {
      texts: string[];
      model?: string;
    },
  ): Promise<{ tokens: number; vectors: number[][] }> {
    const { texts, model } = body;
    return await this.aiService.generateEmbeddings(user.id, texts, model);
  }

  @Post('extract-user-memory')
  async extractUserMemory(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractUserMemoryDto,
  ): Promise<ProposedMemoryItem[]> {
    return await this.aiService.extractUserMemoryFromText(
      user.id,
      dto.text,
      dto.maxLength,
      dto.maxTextChars,
    );
  }

  @Post('extract-assistant-memory')
  async extractAssistantMemory(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractAssistantMemoryDto,
  ): Promise<ExtractAssistantMemoryResponse> {
    return await this.aiService.extractAssistantMemoryFromText(
      user.id,
      dto.text,
      dto.maxLongTerm,
      dto.maxCommitments,
      dto.maxTextChars,
    );
  }

  @Post('ai-model-answer-review')
  async addAiModelAnswersReview(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: AddAiModelAnswerReviewDto,
  ): Promise<boolean | undefined> {
    return await this.aiService.addAiModelAnswersReview(user.id, dto);
  }

  @Post('positive-negative-ai-model-answer')
  async addPositiveNegativeAiModelAnswer(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: AddPositiveNegativeAiModelAnswerDto,
  ): Promise<boolean | undefined> {
    return await this.aiService.addPositiveNegativeAiModelAnswer(user.id, dto);
  }
}
