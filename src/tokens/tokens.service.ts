import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { Repository } from 'typeorm';
import { TokenType } from './types';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(TokenUsageHistory)
    private readonly tokenUsageHistoryRepository: Repository<TokenUsageHistory>,
  ) {}

  async addTokenUserHistory(
    userId: number,
    type: TokenType,
    income: number,
    outcome: number,
  ): Promise<void> {
    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId },
      type,
      income,
      outcome,
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.tokenUsageHistoryRepository.delete({ user: { id: userId } });
  }
}
