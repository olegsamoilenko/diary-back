import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/token-usage-history.entity';
import { Repository } from 'typeorm';
import { TokenType } from './types';
import { AiModel } from 'src/users/types';
import { User } from 'src/users/entities/user.entity';
import { tokensToCredits } from '../plans/utils/tokensToCredits';

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
    );

    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId } as User,
      type,
      aiModel,
      input,
      cachedInput: cachedInputTokens,
      cacheWriteInput: cacheWriteInputTokens,
      output,
      inputCredits: inputUsedCredits,
      outputCredits: outputUsedCredits,
      totalCredits: inputUsedCredits + outputUsedCredits,
      finishReason: finishReason ?? null,
      traceId: meta?.traceId ?? null,
      operation: meta?.operation ?? null,
      estimated,
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.tokenUsageHistoryRepository.delete({ user: { id: userId } });
  }
}
