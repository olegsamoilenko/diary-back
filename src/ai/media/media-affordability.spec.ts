import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from '../ai.service';
import { AiModel } from 'src/users/types';

jest.mock('src/logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

describe('response admission before paid work', () => {
  it.each([false, true])(
    'blocks provider work for insufficient balance (media=%s)',
    async (hasMedia) => {
      const ai: any = Object.create(AiService.prototype);
      const assertRequestAffordable = jest.fn(async () => {
        throw new Error('INSUFFICIENT_AI_CREDITS');
      });
      ai.subscriptionUsageService = { assertRequestAffordable };
      const transcribe = jest.fn();
      const generate = jest.fn();
      ai.openai = { audio: { transcriptions: { create: transcribe } } };
      ai.generateOpenAiChat = generate;
      ai.mediaAnalysis = {
        resolveMessages: jest.fn(
          async (
            _user,
            _model,
            _messages,
            _transcriber,
            _signal,
            options: any,
          ) => {
            await options.beforePaidWork({
              inputTokens: 30000,
              transcriptionCredits: 150,
            });
            return [];
          },
        ),
      };
      await expect(
        ai.executeResponse({
          userId: 7,
          mode: 'entry',
          model: AiModel.QWEN_3_8_MAX,
          messages: [
            {
              role: 'user',
              content: 'A large journal entry '.repeat(2000),
              ...(hasMedia ? { mediaIds: ['owned-media'] } : {}),
            },
          ],
          response: { format: 'text', stream: false },
          accounting: { traceId: 'test' },
        }),
      ).rejects.toThrow('INSUFFICIENT_AI_CREDITS');
      expect(assertRequestAffordable).toHaveBeenCalledWith(
        7,
        expect.any(Number),
      );
      expect(
        (
          assertRequestAffordable.mock.calls[0] as unknown as [number, number]
        )[1],
      ).toBeGreaterThan(500);
      expect(transcribe).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    },
  );
});
