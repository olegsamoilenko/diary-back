import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AiModel } from 'src/users/types';
import { TokenType } from './types';
import { TokensService } from './tokens.service';
import * as diaryInput from '../diary-statistics/diary-stat-ai-input';
import { Logger } from '@nestjs/common';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TokensService', () => {
  it('stores real search calls separately from tokens and includes their cost', async () => {
    jest.spyOn(diaryInput, 'refreshDiaryStatAiInput').mockResolvedValue();
    const repository = {
      manager: {},
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new TokensService(repository as any);
    await service.addTokenUserHistory(
      7,
      TokenType.DIALOG,
      AiModel.GPT_5_6_LUNA,
      1000,
      100,
      undefined,
      false,
      { operation: 'web_search', cachedInputTokens: 200, webSearchCalls: 1 },
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 1000,
        output: 100,
        cachedInput: 200,
        webSearchCalls: 1,
        inputCredits: 2,
        outputCredits: 2,
        webSearchCredits: 100,
        totalCredits: 104,
      }),
    );
  });
  it('separates the reported 13,164-token Luna search without changing its 138-credit total', async () => {
    jest.spyOn(diaryInput, 'refreshDiaryStatAiInput').mockResolvedValue();
    const repository = {
      manager: {},
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new TokensService(repository as any);
    await service.addTokenUserHistory(
      7,
      TokenType.ENTRY_DIALOG,
      AiModel.GPT_5_6_LUNA,
      13164,
      864,
      undefined,
      false,
      { operation: 'web_search', webSearchCalls: 1 },
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 13164,
        output: 864,
        inputCredits: 27,
        outputCredits: 11,
        webSearchCredits: 100,
        webSearchCalls: 1,
        totalCredits: 138,
      }),
    );
  });
  it('persists actual total image-edit tokens and credits at their separate input rates', async () => {
    jest.spyOn(diaryInput, 'refreshDiaryStatAiInput').mockResolvedValue();
    const repository = {
      manager: {},
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new TokensService(repository as any);
    await service.addTokenUserHistory(
      7,
      TokenType.DIALOG,
      AiModel.GPT_IMAGE_2_5_FLARE,
      1100,
      439,
      undefined,
      false,
      { operation: 'generate_image', imageInputTokens: 1000 },
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 1100,
        output: 439,
        inputCredits: 85,
        outputCredits: 132,
        totalCredits: 217,
      }),
    );
  });
  it('stores cached input and bills it at the discounted rate', async () => {
    const refresh = jest
      .spyOn(diaryInput, 'refreshDiaryStatAiInput')
      .mockResolvedValue();
    const repository = {
      manager: {} as any,
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
        inputCredits: 11_200,
        outputCredits: 0,
        totalCredits: 11_200,
      }),
    );
    expect(refresh).toHaveBeenCalledWith(
      repository.manager,
      1,
      'cached-dialog',
      'generate_dialog_response',
    );
    expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      refresh.mock.invocationCallOrder[0],
    );
  });
  it('keeps usage persistence successful if statistics backfill fails', async () => {
    jest
      .spyOn(diaryInput, 'refreshDiaryStatAiInput')
      .mockRejectedValue(new Error('stats unavailable'));
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      manager: {},
    };
    const service = new TokensService(repository as any);
    await expect(
      service.addTokenUserHistory(
        1,
        TokenType.ENTRY,
        AiModel.GPT_5_6_TERRA,
        1000,
        100,
        'stop',
        false,
        { traceId: 'cycle', operation: 'generate_entry_response' },
      ),
    ).resolves.toBeUndefined();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
