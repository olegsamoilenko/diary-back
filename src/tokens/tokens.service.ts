import { Injectable, Logger } from '@nestjs/common';
import { refreshDiaryStatAiInput } from '../diary-statistics/diary-stat-ai-input';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/token-usage-history.entity';
import { EntityManager, Repository } from 'typeorm';
import { TokenType } from './types';
import { AiModel } from 'src/users/types';
import { User } from 'src/users/entities/user.entity';
import {
  getWebSearchCredits,
  tokensToCredits,
} from '../plans/utils/tokensToCredits';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(TokenUsageHistory)
    private readonly tokenUsageHistoryRepository: Repository<TokenUsageHistory>,
  ) {}

  async addTokenUserHistory(
    userId: number,
    type: TokenType,
    aiModel: AiModel,
    input: number,
    output: number,
    finishReason?: string | null,
    estimated?: boolean,
    meta?: {
      traceId?: string;
      operation?: string;
      cachedInputTokens?: number;
      cacheWriteInputTokens?: number;
      imageInputTokens?: number;
      webSearchCalls?: number;
    },
  ): Promise<void> {
    const cachedInputTokens = Math.min(
      Math.max(0, Math.trunc(input)),
      Math.max(0, Math.trunc(meta?.cachedInputTokens ?? 0)),
    );
    const cacheWriteInputTokens = Math.min(
      Math.max(0, Math.trunc(input)) - cachedInputTokens,
      Math.max(0, Math.trunc(meta?.cacheWriteInputTokens ?? 0)),
    );
    const { inputUsedCredits, outputUsedCredits } = tokensToCredits(
      aiModel,
      input,
      output,
      cachedInputTokens,
      cacheWriteInputTokens,
      meta?.imageInputTokens,
      meta?.webSearchCalls,
    );

    const webSearchCredits = getWebSearchCredits(meta?.webSearchCalls);
    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId } as User,
      type,
      aiModel,
      input,
      cachedInput: cachedInputTokens,
      cacheWriteInput: cacheWriteInputTokens,
      output,
      webSearchCalls: meta?.webSearchCalls ?? 0,
      inputCredits: inputUsedCredits - webSearchCredits,
      outputCredits: outputUsedCredits,
      webSearchCredits,
      totalCredits: inputUsedCredits + outputUsedCredits,
      finishReason: finishReason ?? null,
      traceId: meta?.traceId ?? null,
      operation: meta?.operation ?? null,
      estimated,
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
    try {
      await refreshDiaryStatAiInput(
        this.tokenUsageHistoryRepository.manager,
        userId,
        meta?.traceId ?? null,
        meta?.operation ?? null,
      );
    } catch {
      // Analytics must not turn an already paid model response into an error.
      Logger.warn(
        'Could not refresh diary statistics input usage',
        TokensService.name,
      );
    }
  }

  async deleteByUserId(userId: number, manager?: EntityManager): Promise<void> {
    const repository =
      manager?.getRepository(TokenUsageHistory) ??
      this.tokenUsageHistoryRepository;
    await repository.delete({ user: { id: userId } });
  }
}
