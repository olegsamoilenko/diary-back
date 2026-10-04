import { toResponsesRequest } from './utils/openai-responses';
import { describe, expect, it, jest } from '@jest/globals';
import { AiService, AiResponseRequest } from './ai.service';
import { AiModel } from '../users/types';
import { AiProvider, MODEL_REGISTRY } from './types/providers';
import {
  redactMediaDebug,
  formatAiRequestDebug,
  summarizeAiCacheRequest,
  aiProviderCacheMetadata,
} from './utils/ai-request-debug';

jest.mock('./entry-flow-debug', () => ({ scheduleServerDebugTask: jest.fn() }));
jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const image = { base64: 'AAAA', width: 512, height: 512, label: 'Photo 1' };
function finalResponse(status = 'completed') {
  return {
    id: 'resp_test',
    status,
    model: 'gpt-5.6-terra',
    incomplete_details:
      status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Answer' }],
      },
    ],
    usage: {
      input_tokens: 3000,
      output_tokens: 100,
      total_tokens: 3100,
      input_tokens_details: { cached_tokens: 1500, cache_write_tokens: 500 },
      output_tokens_details: { reasoning_tokens: 40 },
    },
  };
}
function fixture({
  images = true,
  streaming = true,
  model = AiModel.GPT_5_6_TERRA,
} = {}) {
  const service: any = Object.create(AiService.prototype);
  const create = jest.fn<(payload: any, options?: any) => Promise<any>>(
    async (payload: any) => {
      if (!payload.stream) return finalResponse();
      return (async function* () {
        yield { type: 'response.output_text.delta', delta: 'Answer' };
        yield { type: 'response.completed', response: finalResponse() };
      })();
    },
  );
  const chat = jest.fn<any>(async () => {
    const value = {
      choices: [
        {
          message: { content: 'Answer' },
          delta: { content: 'Answer' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 3000,
        completion_tokens: 100,
        total_tokens: 3100,
      },
    };
    return streaming
      ? (async function* () {
          yield value;
        })()
      : value;
  });
  const persist = jest.fn<any>(async () => {});
  Object.assign(service, {
    openai: { responses: { create }, chat: { completions: { create: chat } } },
    getQwenClient: () => ({ chat: { completions: { create: chat } } }),
    mediaAnalysis: {
      resolveMessages: async (
        _user: unknown,
        _model: unknown,
        messages: any[],
        _transcriber: unknown,
        _signal: unknown,
        options: any,
      ) => {
        await options.beforePaidWork({
          inputTokens: images ? 300 : 0,
          transcriptionCredits: 0,
        });
        return messages.map((m, i) => ({
          ...m,
          ...(images && i === 2 ? { images: [image] } : {}),
        }));
      },
    },
    subscriptionUsageService: {
      assertRequestAffordable: jest.fn(async () => {}),
    },
    persistAiUsage: persist,
    logger: { log: jest.fn() },
    countOpenAiTokens: () => 3000,
    countStringTokens: () => 5,
  });
  const onToken = jest.fn();
  const request: AiResponseRequest = {
    userId: 1,
    mode: 'entry',
    model,
    messages: [
      { role: 'system', content: 'Common' },
      { role: 'user', content: 'Context' },
      {
        role: 'user',
        content: 'Entry',
        ...(images ? { mediaIds: ['test-owned-image'] } : {}),
      },
    ],
    cache: { key: 'same-key', openAiPrefix: 'Common', messageIndexes: [1] },
    response: { format: 'text', stream: streaming },
    onToken,
    accounting: { operation: 'test', cycleComplete: true },
  };
  return { service, request, create, chat, persist, onToken };
}

describe('OpenAI image Responses comparison adapter', () => {
  it.each([true, false])(
    'uses Responses for images, with shared accounting (stream=%s)',
    async (streaming) => {
      const f = fixture({ streaming });
      f.request.response.format = 'json';
      const result = await f.service.executeResponse(f.request);
      expect(f.chat).not.toHaveBeenCalled();
      expect(f.create).toHaveBeenCalledTimes(1);
      const payload = f.create.mock.calls[0][0];
      expect(payload).toMatchObject({
        store: false,
        service_tier: 'default',
        reasoning: { effort: 'medium' },
        max_output_tokens: 2048,
        text: { format: { type: 'json_object' } },
        prompt_cache_key: 'same-key',
        prompt_cache_options: { mode: 'explicit' },
      });
      expect(payload).not.toHaveProperty('messages');
      expect(payload.input[0].content[0]).toMatchObject({
        type: 'input_text',
        text: 'Common',
        prompt_cache_breakpoint: { mode: 'explicit' },
      });
      expect(payload.input[1].content[0].prompt_cache_breakpoint).toEqual({
        mode: 'explicit',
      });
      expect(payload.input[2].content.at(-1)).toEqual({
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,AAAA',
        detail: 'high',
      });
      expect(result).toMatchObject({
        inputTokens: 3000,
        outputTokens: 100,
        cachedInputTokens: 1500,
        cacheWriteInputTokens: 500,
        estimated: false,
        finishReason: 'stop',
      });
      expect(f.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 3000,
          outputTokens: 100,
          cachedInputTokens: 1500,
          cacheWriteInputTokens: 500,
        }),
      );
    },
  );
  it('moves assistant cache boundaries to the following input without changing dialogue text or roles', async () => {
    const f = fixture();
    f.request.mode = 'dialog';
    f.request.messages.push(
      { role: 'assistant', content: 'Original answer' },
      { role: 'user', content: 'Question' },
    );
    f.request.cache!.messageIndexes = [1, 3];
    await f.service.executeResponse(f.request);
    expect(f.create.mock.calls[0][0].input[3]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Original answer',
          annotations: [],
        },
      ],
    });
    expect(f.create.mock.calls[0][0].input[4]).toEqual({
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Question',
          prompt_cache_breakpoint: { mode: 'explicit' },
        },
      ],
    });
    expect(f.onToken).toHaveBeenCalledWith('Answer');
  });
  it.each([true, false])(
    'keeps text-only requests on Chat Completions (stream=%s)',
    async (streaming) => {
      const f = fixture({ images: false, streaming });
      await f.service.executeResponse(f.request);
      expect(f.create).not.toHaveBeenCalled();
      expect(f.chat).toHaveBeenCalledTimes(1);
    },
  );
  it('does not route Qwen images to OpenAI', async () => {
    expect(MODEL_REGISTRY[AiModel.QWEN_3_8_MAX].provider).toBe(AiProvider.QWEN);
    const f = fixture({ model: AiModel.QWEN_3_8_MAX });
    await f.service.executeResponse(f.request);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.chat).toHaveBeenCalledTimes(1);
  });
  it('maps output exhaustion to the existing length contract', async () => {
    const f = fixture({ streaming: false });
    f.create.mockResolvedValue(finalResponse('incomplete'));
    expect(await f.service.executeResponse(f.request)).toMatchObject({
      finishReason: 'length',
    });
  });
  it('does not retry on another endpoint after a provider failure', async () => {
    const f = fixture();
    f.create.mockImplementation(async () =>
      (async function* () {
        yield {
          type: 'response.failed',
          response: { error: { message: 'Provider failure' } },
        };
      })(),
    );
    await expect(f.service.executeResponse(f.request)).rejects.toThrow(
      'Provider failure',
    );
    expect(f.chat).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it('charges an interrupted stream through the existing estimated-usage path, then aborts', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.request.runtime = { signal: controller.signal, outputLimit: 2048 };
    f.create.mockImplementation(async () =>
      (async function* () {
        yield { type: 'response.output_text.delta', delta: 'Partial' };
        controller.abort();
        throw new Error('aborted');
      })(),
    );
    await expect(f.service.executeResponse(f.request)).rejects.toThrow();
    expect(f.persist).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: 'cancelled', estimated: true }),
    );
    expect(f.create.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
      maxRetries: 0,
    });
    expect(f.chat).not.toHaveBeenCalled();
  });
  it('logs Responses input and usage without base64 and preserves missing write counters', async () => {
    const f = fixture();
    await f.service.executeResponse(f.request);
    const payload = f.create.mock.calls[0][0];
    const safe = redactMediaDebug(payload) as object;
    expect(JSON.stringify(safe)).not.toContain('base64,AAAA');
    expect(formatAiRequestDebug({ mode: 'entry', payload: safe })).toContain(
      'Entry',
    );
    expect(summarizeAiCacheRequest(payload).messages).toHaveLength(3);
    expect(
      aiProviderCacheMetadata(finalResponse()).cacheFields.cache_write_tokens,
    ).toEqual({ reported: true, value: 500 });
    expect(
      aiProviderCacheMetadata({
        usage: { input_tokens_details: { cached_tokens: 0 } },
      }).cacheFields.cache_write_tokens.reported,
    ).toBe(false);
  });
});

describe('uncapped main response transport', () => {
  it('does not restore an output cap when mapping chat requests with media to Responses', () => {
    const request = toResponsesRequest({
      model: 'gpt-5.6-terra',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Explain this' }] },
      ],
      stream: true,
    });
    expect(request).not.toHaveProperty('max_output_tokens');
  });
});
