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
    finishReason?: string,
    estimated?: boolean,
  ): Promise<void> {
    const { inputUsedCredits, outputUsedCredits } = tokensToCredits(
      aiModel,
      input,
      output,
    );

    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId } as User,
      type,
      aiModel,
      input,
      output,
      inputCredits: inputUsedCredits,
      outputCredits: outputUsedCredits,
      totalCredits: inputUsedCredits + outputUsedCredits,
      finishReason: finishReason ?? null,
      estimated,
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.tokenUsageHistoryRepository.delete({ user: { id: userId } });
  }
}
