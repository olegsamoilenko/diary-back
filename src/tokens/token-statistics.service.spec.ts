import { describe, expect, it, jest } from '@jest/globals';
import { TokenStatisticsService } from './token-statistics.service';
import { TokenType } from './types';

describe('TokenStatisticsService', () => {
  it('returns check-in usage in its own statistics bucket', async () => {
    const row = {
      type: TokenType.CHECKIN,
      user: {
        uuid: 'user-uuid',
        name: 'User',
        email: 'user@example.com',
      },
      input: 100,
      cachedInput: 20,
      cacheWriteInput: 0,
      output: 30,
      inputCredits: 4,
      outputCredits: 5,
      finishReason: 'stop',
    };
    const queryBuilder: Record<string, jest.Mock> = {};
    queryBuilder.innerJoinAndSelect = jest.fn(() => queryBuilder);
    queryBuilder.orderBy = jest.fn(() => queryBuilder);
    queryBuilder.skip = jest.fn(() => queryBuilder);
    queryBuilder.take = jest.fn(() => queryBuilder);
    queryBuilder.getManyAndCount = jest.fn(async () => [[row], 1]);
    const repository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const service = new TokenStatisticsService(repository as never);

    const result = await service.getTokenUsageStatistics();

    expect(result.stat[TokenType.CHECKIN]).toEqual([
      expect.objectContaining({
        userUuid: 'user-uuid',
        input: 100,
        output: 30,
      }),
    ]);
    expect(result.stat[TokenType.ENTRY]).toEqual([]);
  });
});
