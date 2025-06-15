import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(TokenUsageHistory)
    private readonly tokenUsageHistoryRepository: Repository<TokenUsageHistory>,
  ) {}

  async addTokenUserHistory(userId: number, tokensUsed: number): Promise<void> {
    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId },
      tokensUsed,
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
  }
}
