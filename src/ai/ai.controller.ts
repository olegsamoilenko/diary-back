import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AiService } from './ai.service';
import { CreateAiCommentDto } from './dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { EmbeddingIndexRoute, PlanGuard } from './guards/plan.guard';
import { TiktokenModel } from 'tiktoken';
import { ExtractUserMemoryDto } from './dto';
import { ProposedMemoryItem } from './types';
import { ExtractAssistantMemoryDto } from './dto/extract-assistant-memory.dto';
import { ExtractAssistantMemoryResponse } from './types/assistantMemory';
import { AiModel } from 'src/users/types';
import { AddAiModelAnswerReviewDto } from './dto/add-ai-model-answer-review.dto';
import { AddPositiveNegativeAiModelAnswerDto } from './dto/add-positive-negative-ai-model-answer.dto';
import { JwtAuthGuard } from 'src/auth/strategies/JwtAuthGuard';
import { ModelReviewService } from './model-review.service';
import { EmbeddingBatchService } from './embeddings/embedding-batch.service';
import { ExtractUserMemoryCapsuleV2Dto } from './dto/extract-user-memory-capsule-v2.dto';
import { ExtractAssistantMemoryCapsuleV2Dto } from './dto/extract-assistant-memory-capsule-v2.dto';
import { ExtractDialogMemoryCapsuleV2Dto } from './dto/extract-dialog-memory-capsule-v2.dto';
import { PreviewUserMemoryConsolidationV2Dto } from './dto/preview-user-memory-consolidation-v2.dto';
import type {
  ExtractAssistantMemoryCapsuleV2Response,
  ExtractDialogMemoryCapsuleV2Response,
  ExtractUserMemoryDetailsV2Response,
  RetrievalIndexV2Response,
  PreviewUserMemoryConsolidationV2Response,
} from './types/memoryCapsuleV2';
import { logServerMemoryReview } from './entry-flow-debug';
import { UserRemindersService } from 'src/push-notifications/user-reminders.service';

@UseGuards(AuthGuard('jwt'), PlanGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly modelReviewService: ModelReviewService,
    private readonly embeddingBatchService: EmbeddingBatchService,
    private readonly userRemindersService: UserRemindersService,
  ) {}

  @Post('preflight')
  @UseGuards(JwtAuthGuard, PlanGuard)
  aiPreflight(@Body() body: { aiModel?: AiModel }) {
    return { ok: true, aiModel: body?.aiModel ?? null };
  }

  @Post('generate-embeddings')
  @EmbeddingIndexRoute()
  @UseGuards(JwtAuthGuard, PlanGuard)
  async generateEmbeddings(
    @ActiveUserData() user: ActiveUserDataT,
    @Req() request: Request,
    @Body()
    body: {
      texts: string[];
      model?: string;
      timingTraceId?: string;
      reviewSourceType?: 'entry' | 'checkin';
      indexingOnly?: boolean;
    },
  ): Promise<{ tokens: number; vectors: number[][]; cached?: boolean }> {
    const { texts, model, timingTraceId } = body;
    const result = await this.embeddingBatchService.generate({
      userId: user.id,
      texts,
      modelOverride: model,
      indexingOnly: body.indexingOnly === true,
      requestId: (request as Request & { requestId?: string }).requestId,
      timingTraceId,
    });
    return result;
  }

  @Post('extract-user-memory')
  @UseGuards(JwtAuthGuard, PlanGuard)
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
  @UseGuards(JwtAuthGuard, PlanGuard)
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

  @Post('memory-capsules/v2/build-retrieval-index')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async buildRetrievalIndexV2(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractUserMemoryCapsuleV2Dto,
  ): Promise<RetrievalIndexV2Response> {
    const startedAt = Date.now();
    const result = await this.aiService.buildRetrievalIndexV2(user.id, dto);

    logServerMemoryReview({
      step: 1,
      title: 'ЩО МОДЕЛЬ ВИТЯГЛА З ТЕКСТУ',
      sourceType: dto.sourceType,
      traceId: dto.timingTraceId,
      userId: user.id,
      durationMs: Date.now() - startedAt,
      sections: [
        {
          label: 'ТЕГИ',
          value: result.tags.map((item) => item.key),
          count: result.tags.length,
        },
        {
          label: 'НОВІ ТЕГИ',
          value: result.newTags.map((item) => item.key),
          count: result.newTags.length,
        },
        {
          label: 'ОПТИМІЗОВАНИЙ ТЕКСТ ДЛЯ КАПСУЛИ',
          value: result.userDigest,
          count: result.userDigest ? 1 : 0,
        },
      ],
    });

    return result;
  }

  @Post('memory-capsules/v2/extract-user-details')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async extractUserMemoryDetailsV2(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractUserMemoryCapsuleV2Dto,
  ): Promise<ExtractUserMemoryDetailsV2Response> {
    const startedAt = Date.now();
    const result = await this.aiService.extractUserMemoryDetailsV2(
      user.id,
      dto,
    );

    logServerMemoryReview({
      step: 1,
      title: "ФОРМУВАННЯ ДОВГОТРИВАЛОЇ ПАМ'ЯТІ КОРИСТУВАЧА",
      sourceType: dto.sourceType,
      traceId: dto.timingTraceId,
      userId: user.id,
      durationMs: Date.now() - startedAt,
      sections: [
        {
          label: "СФОРМОВАНА ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
          value: result.userMemory,
          count: result.userMemory.length,
        },
      ],
    });

    return result;
  }

  @Post('memory-capsules/v2/extract-assistant')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async extractAssistantMemoryCapsuleV2(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractAssistantMemoryCapsuleV2Dto,
  ): Promise<ExtractAssistantMemoryCapsuleV2Response> {
    const startedAt = Date.now();
    const upcomingReminders = dto.activeScheduledReminders === undefined
      ? await this.userRemindersService.listUpcoming(user.id) : [];
    const result = await this.aiService.extractAssistantMemoryCapsuleV2(
      user.id,
      {
        ...dto,
        activeScheduledReminders: dto.activeScheduledReminders ?? upcomingReminders.map((item) => ({
          reminderKey: item.reminderKey,
          text: item.body,
          localDate: item.localDate,
          localTime: item.localTime,
        })),
      },
    );

    logServerMemoryReview({
      step: 4,
      title: 'ФІНАЛЬНА ПАМ’ЯТЬ І ОБІЦЯНКИ NEMORY',
      sourceType: dto.sourceType ?? 'entry',
      traceId: dto.timingTraceId,
      userId: user.id,
      durationMs: Date.now() - startedAt,
      sections: [
        {
          label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ NEMORY З РЕФЛЕКСІЇ",
          value: result.assistantMemory,
          count: result.assistantMemory.length,
        },
        {
          label: 'НОВІ ОБІЦЯНКИ NEMORY',
          value: result.commitments,
          count: result.commitments.length,
        },
        {
          label: 'ОНОВЛЕННЯ ОБІЦЯНОК',
          value: result.commitmentUpdates,
          count: result.commitmentUpdates.length,
        },
        {
          label: 'ТОЧНІ НАГАДУВАННЯ',
          value: result.scheduledReminders,
          count: result.scheduledReminders.length,
        },
        {
          label: 'ОНОВЛЕННЯ НАГАДУВАНЬ',
          value: result.scheduledReminderUpdates,
          count: result.scheduledReminderUpdates.length,
        },
      ],
    });

    return result;
  }

  @Post('memory-capsules/v2/extract-dialog')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async extractDialogMemoryCapsuleV2(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ExtractDialogMemoryCapsuleV2Dto,
  ): Promise<ExtractDialogMemoryCapsuleV2Response> {
    const startedAt = Date.now();
    const upcomingReminders = dto.activeScheduledReminders === undefined
      ? await this.userRemindersService.listUpcoming(user.id) : [];
    const result = await this.aiService.extractDialogMemoryCapsuleV2(user.id, {
      ...dto,
      activeScheduledReminders: dto.activeScheduledReminders ?? upcomingReminders.map((item) => ({
        reminderKey: item.reminderKey,
        text: item.body,
        localDate: item.localDate,
        localTime: item.localTime,
      })),
    });

    if (dto.timingTraceId) {
      const sourceType = dto.reviewSourceType ?? 'dialog';
      logServerMemoryReview({
        step: 1,
        title: 'ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ',
        sourceType,
        traceId: dto.timingTraceId,
        userId: user.id,
        durationMs: Date.now() - startedAt,
        sections: [
          {
            label: 'ТЕГИ ПИТАННЯ',
            value: result.user.tags.map((item) => item.key),
            count: result.user.tags.length,
          },
          {
            label: 'НОВІ ТЕГИ',
            value: result.user.newTags.map((item) => item.key),
            count: result.user.newTags.length,
          },
          {
            label: 'КАПСУЛА ПИТАННЯ',
            value: result.user.text,
          },
          {
            label: "ПАМ'ЯТЬ КОРИСТУВАЧА У КАПСУЛІ ПИТАННЯ",
            value: result.user.userMemory,
            count: result.user.userMemory.length,
          },
        ],
      });
      logServerMemoryReview({
        step: 4,
        title: 'ВИТЯГНУТА ПАМ’ЯТЬ ТА ОБІЦЯНКИ ПІСЛЯ ДІАЛОГУ',
        sourceType,
        traceId: dto.timingTraceId,
        userId: user.id,
        durationMs: Date.now() - startedAt,
        sections: [
          {
            label: 'КАПСУЛА ВІДПОВІДІ ДЛЯ СТАРИХ ХОДІВ АКТИВНОГО ДІАЛОГУ',
            value: result.assistant.text,
          },
          {
            label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ NEMORY З ВІДПОВІДІ",
            value: result.assistant.assistantMemory,
            count: result.assistant.assistantMemory.length,
          },
          {
            label: 'НОВІ ОБІЦЯНКИ NEMORY',
            value: result.commitments,
            count: result.commitments.length,
          },
          {
            label: 'ОНОВЛЕННЯ ОБІЦЯНОК',
            value: result.commitmentUpdates,
            count: result.commitmentUpdates.length,
          },
          {
            label: 'ТОЧНІ НАГАДУВАННЯ',
            value: result.scheduledReminders,
            count: result.scheduledReminders.length,
          },
          {
            label: 'ОНОВЛЕННЯ НАГАДУВАНЬ',
            value: result.scheduledReminderUpdates,
            count: result.scheduledReminderUpdates.length,
          },
        ],
      });
    }

    return result;
  }

  @Post('memory-capsules/v2/preview-user-memory-consolidation')
  @UseGuards(JwtAuthGuard, PlanGuard)
  async previewUserMemoryConsolidationV2(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PreviewUserMemoryConsolidationV2Dto,
  ): Promise<PreviewUserMemoryConsolidationV2Response> {
    return this.aiService.previewUserMemoryConsolidationV2(user.id, dto);
  }

  @Post('ai-model-answer-review')
  async addAiModelAnswersReview(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: AddAiModelAnswerReviewDto,
  ): Promise<boolean | undefined> {
    return await this.modelReviewService.addAiModelAnswersReview(user.id, dto);
  }

  @Post('positive-negative-ai-model-answer')
  async addPositiveNegativeAiModelAnswer(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: AddPositiveNegativeAiModelAnswerDto,
  ): Promise<boolean | undefined> {
    return await this.modelReviewService.addPositiveNegativeAiModelAnswer(
      user.id,
      dto,
    );
  }
}
