import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { Repository } from 'typeorm';
import { TokenType } from './types';
import { AiModel } from 'src/users/types';
import { User } from 'src/users/entities/user.entity';
import { calculateTokensCoast } from './utils/calculateTokensCoast';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(TokenUsageHistory)
    private readonly tokenUsageHistoryRepository: Repository<TokenUsageHistory>,
  ) {}

  async addTokenUserHistory(
    userId: number,
    type: TokenType,
    aiModel: string,
    input: number,
    output: number,
  ): Promise<void> {
    const { inputCoastToken, outputCoastToken, totalCoastToken } =
      calculateTokensCoast(aiModel as AiModel, input, output);

    const tokenUsageHistory = this.tokenUsageHistoryRepository.create({
      user: { id: userId } as User,
      type,
      aiModel: aiModel as AiModel,
      input,
      output,
      inputCoast: inputCoastToken.toString(),
      outputCoast: outputCoastToken.toString(),
      totalCoast: totalCoastToken.toString(),
    });

    await this.tokenUsageHistoryRepository.save(tokenUsageHistory);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.tokenUsageHistoryRepository.delete({ user: { id: userId } });
  }
}
