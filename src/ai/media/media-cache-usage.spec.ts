import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from '../ai.service';
import { AiModel } from 'src/users/types';
import { writeContextAudit } from 'src/logs/context-audit';

jest.mock('src/logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
jest.mock('../utils/ai-request-debug', () => ({
  ...jest.requireActual<typeof import('../utils/ai-request-debug')>(
    '../utils/ai-request-debug',
  ),
  writeAiRequestDebug: jest.fn(),
}));

describe('media cache usage diagnostics', () => {
  it.each([false, true])(
    'preserves raw usage and marked image requests (stream=%s)',
    async (streaming) => {
      const ai: any = Object.create(AiService.prototype);
      const usage = {
        input_tokens: 4500,
        output_tokens: 30,
        total_tokens: 4530,
        // A future provider field must survive diagnostics without being counted twice.
        input_tokens_details: {
          cached_tokens: 2100,
          cache_write_tokens: 800,
          image_tokens: 600,
        },
      };
      const response = {
        id: 'synthetic-response',
        model: 'gpt-5.6-terra',
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Answer' }],
          },
        ],
        usage,
      };
      const create = jest.fn(async () =>
        streaming
          ? (async function* () {
              yield { type: 'response.output_text.delta', delta: 'Answer' };
              yield { type: 'response.completed', response };
            })()
          : response,
      );
      ai.openai = { responses: { create } };
      const messages = [
        { role: 'system', content: 'Shared instructions' },
        {
          role: 'user',
          content: 'Source',
          images: [
            {
              base64: 'aW1hZ2U=',
              label: 'Attachment 1',
              width: 100,
              height: 100,
            },
          ],
        },
      ];
      const result = streaming
        ? await ai.streamOpenAiChat(
            AiModel.GPT_5_6_TERRA,
            'gpt-5.6-terra',
            messages,
            jest.fn(),
            'dialog',
            false,
            'same-key',
            'Shared instructions',
            [1],
          )
        : await ai.generateOpenAiChat(
            AiModel.GPT_5_6_TERRA,
            'gpt-5.6-terra',
            messages,
            'entry',
            false,
            'same-key',
            'Shared instructions',
            [1],
          );
      expect(result.cachedInputTokens).toBe(2100);
      expect(result.cacheWriteInputTokens).toBe(800);
      expect(writeContextAudit).toHaveBeenCalledWith(
        'provider.usage.raw',
        expect.objectContaining({
          responseId: 'synthetic-response',
          api: 'responses',
          hasImages: true,
          usage,
        }),
      );
      const request = (create.mock.calls as unknown as Array<[any]>)[0][0];
      expect(request.prompt_cache_options).toEqual({ mode: 'explicit' });
      expect(request.input[1].content.at(-1).prompt_cache_breakpoint).toEqual({
        mode: 'explicit',
      });
      expect(
        request.input[1].content.some(
          (part: any) => part.type === 'input_image',
        ),
      ).toBe(true);
    },
  );
});
