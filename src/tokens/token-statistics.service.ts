import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { Repository } from 'typeorm';
import { TokenType, TokenUsageItem, TokenUsageStat } from './types';

@Injectable()
export class TokenStatisticsService {
  constructor(
    @InjectRepository(TokenUsageHistory)
    private readonly tokenUsageHistoryRepository: Repository<TokenUsageHistory>,
  ) {}

  async getTokenUsageStatistics(page = 1, limit = 200) {
    const p = Math.max(page ?? 1, 1);
    const l = Math.min(Math.max(limit ?? 200, 1), 1000);
    const skip = (p - 1) * l;

    const qb = this.tokenUsageHistoryRepository
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.user', 'user')
      .orderBy('t.createdAt', 'DESC')
      .skip(skip)
      .take(l);

    const [rows, total] = await qb.getManyAndCount();

    const stat: TokenUsageStat = {
      [TokenType.ENTRY]: [],
      [TokenType.DIALOG]: [],
      [TokenType.EMBEDDING]: [],
      [TokenType.USER_MEMORY]: [],
      [TokenType.ASSISTANT_MEMORY]: [],
    };

    for (const row of rows) {
      const item: TokenUsageItem = {
        userUuid: row.user.uuid,
        userName: row.user.name,
        userEmail: row.user.email,
        input: Number(row.input) || 0,
        output: Number(row.output) || 0,
        inputCoast: Number(row.inputCoast) || 0,
        outputCoast: Number(row.outputCoast) || 0,
      };

      stat[row.type].push(item);
    }
    return {
      stat,
      meta: {
        page: p,
        limit: l,
        total,
        pageCount: Math.max(1, Math.ceil(total / l)),
      },
    };
  }
}
