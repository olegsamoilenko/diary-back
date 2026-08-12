import { describe, expect, it, jest } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { TokenType } from './types';
import { TokensService } from './tokens.service';

describe('TokensService', () => {
  it('stores cached input and bills it at the discounted rate', async () => {
    const repository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
    };
    const service = new TokensService(repository as any);

    await service.addTokenUserHistory(
      1,
      TokenType.DIALOG,
      AiModel.GPT_5_6_TERRA,
      1_000_000,
      0,
      'stop',
      false,
      {
        traceId: 'cached-dialog',
        operation: 'generate_dialog_response',
        cachedInputTokens: 800_000,
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 1_000_000,
        cachedInput: 800_000,
        inputCredits: 8_400,
        outputCredits: 0,
        totalCredits: 8_400,
      }),
    );
  });
});
