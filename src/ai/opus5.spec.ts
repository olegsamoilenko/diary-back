import { describe, expect, it, jest } from '@jest/globals';
import { AiService, AiContentMode } from './ai.service';
import { AiModel } from '../users/types';

jest.mock('./entry-flow-debug', () => ({
  logServerMemoryReview: jest.fn(),
  scheduleServerDebugTask: jest.fn(),
  writeFullServerDebugLog: jest.fn(),
}));

const usage = {
  input_tokens: 200,
  cache_read_input_tokens: 800,
  cache_creation_input_tokens: 100,
  output_tokens: 100,
};
const reflection = JSON.stringify({
  shortText: 'Ти можеш перепочити.',
  fullText: 'Сьогодні був насичений день. Дай собі час відпочити.',
  tags: [],
});

function fixture(shortReflection = true, model = AiModel.CLAUDE_OPUS_5) {
  const service = Object.create(AiService.prototype);
  service.usersService = {
    findById: jest.fn(async () => ({
      name: 'Test',
      settings: {
        shortAiReflectionEnabled: shortReflection,
        conversationLanguage: 'uk',
      },
    })),
  };
  service.subscriptionUsageService = {
    getEffectiveAiBasePlanId: jest.fn(async () => null),
    assertRequestAffordable: jest.fn(async () => {}),
  };
  service.getStylesBlock = jest.fn(async () => '');
  service.persistAiUsage = jest.fn(async () => undefined);
  service.logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const create = jest.fn(async (params: Record<string, unknown>) => {
    const content = shortReflection ? reflection : 'Ти можеш перепочити.';
    if (params.stream) {
      return (async function* () {
        yield {
          type: 'message_start',
          message: { usage: { ...usage, output_tokens: 0 } },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'INTERNAL_REASONING' },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: content.slice(0, 12) },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: content.slice(12) },
        };
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: usage.output_tokens },
        };
      })();
    }
    return {
      content: [
        { type: 'thinking', thinking: 'INTERNAL_REASONING' },
        { type: 'text', text: content },
      ],
      stop_reason: 'end_turn',
      usage,
    };
  });
  const wrongProvider = jest.fn(() => {
    throw new Error('Wrong AI provider');
  });
  service.qwen = { chat: { completions: { create: wrongProvider } } };
  service.openai = { chat: { completions: { create: wrongProvider } } };
  service.anthropic = { messages: { create } };
  const onToken = jest.fn();
  const generate = (mode: AiContentMode, structured = true) =>
    service.generateComment(
      42,
      '',
      { role: 'system', content: '' },
      { role: 'system', content: '' },
      { role: 'system', content: '' },
      [],
      '',
      'Синтетичний тест: сьогодні втомився.',
      {
        timeZone: 'Europe/Kiev',
        nowLocalText: '2026-09-03 15:00',
        locale: 'uk-UA',
      },
      model,
      'calm',
      onToken,
      mode,
      null,
      undefined,
      undefined,
      [],
      false,
      shortReflection,
      undefined,
      structured,
      'memory_capsules_v2',
      Date.UTC(2026, 8, 3),
    );
  return { service, create, wrongProvider, onToken, generate };
}

describe.each([
  AiModel.CLAUDE_OPUS_5,
  AiModel.CLAUDE_SONNET_5,
  AiModel.CLAUDE_SONNET_5_5,
])('%s integration', (model) => {
  const effectiveModel =
    model === AiModel.CLAUDE_SONNET_5 ? AiModel.CLAUDE_SONNET_5_5 : model;
  it.each([
    ['entry', true, true],
    ['entry', true, false],
    ['checkin', true, true],
    ['checkin', true, false],
    ['entry', false, false],
    ['checkin', false, false],
    ['dialog', false, false],
    ['checkin_dialog', false, false],
  ] as Array<[AiContentMode, boolean, boolean]>)(
    'routes %s (short=%s, streaming=%s) to Anthropic with provider billing',
    async (mode, short, structured) => {
      const f = fixture(short, model);
      const result = await f.generate(mode, structured);
      expect(f.create).toHaveBeenCalledTimes(1);
      const request = f.create.mock.calls[0][0];
      expect(request).toMatchObject({
        model: effectiveModel,
        thinking: {
          type: model !== AiModel.CLAUDE_OPUS_5 ? 'adaptive' : 'disabled',
        },
        max_tokens: 128_000,
        service_tier: 'standard_only',
      });
      if (model !== AiModel.CLAUDE_OPUS_5)
        expect(request.output_config).toEqual({ effort: 'medium' });
      else expect(request).not.toHaveProperty('output_config');
      expect(request).not.toHaveProperty('temperature');
      expect(request).not.toHaveProperty('top_p');
      expect(f.wrongProvider).not.toHaveBeenCalled();
      expect(result.content).toContain(short ? 'Сьогодні' : 'перепочити');
      expect(result.content).not.toContain('INTERNAL_REASONING');
      if (short) expect(result.shortText).toBe('Ти можеш перепочити.');
      expect(result.usage.tokensFromProvider).toEqual({
        inputTotal: 1100,
        standardInput: 200,
        cacheReadInput: 800,
        cacheWriteInput: 100,
        output: 100,
        total: 1200,
      });
      expect(result.usage.chargedCredits).toEqual({
        input: model !== AiModel.CLAUDE_OPUS_5 ? 9 : 21,
        output: model !== AiModel.CLAUDE_OPUS_5 ? 10 : 25,
        total: model !== AiModel.CLAUDE_OPUS_5 ? 19 : 46,
      });
      expect(f.service.persistAiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          model: effectiveModel,
          inputTokens: 1100,
          cachedInputTokens: 800,
          cacheWriteInputTokens: 100,
          outputTokens: 100,
          estimated: false,
        }),
      );
      expect(f.onToken.mock.calls.flat().join('')).not.toContain(
        'INTERNAL_REASONING',
      );
    },
  );
  it.each(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'])(
    'preserves existing request options for %s',
    async (legacyModel) => {
      const f = fixture();
      await f.service.generateClaudeChat(
        legacyModel,
        [{ role: 'user', content: 'Synthetic test' }],
        'entry',
      );
      await f.service.streamClaudeChat(
        legacyModel,
        [{ role: 'user', content: 'Synthetic test' }],
        f.onToken,
        'dialog',
      );
      for (const [request] of f.create.mock.calls) {
        expect(request.model).toBe(legacyModel);
        expect(request).not.toHaveProperty('thinking');
      }
    },
  );
  it('does not record usage or change provider when the requested model is unavailable', async () => {
    const f = fixture(true, model);
    const error = Object.assign(new Error('Model unavailable'), {
      status: 404,
    });
    f.create.mockRejectedValueOnce(error);
    await expect(f.generate('entry')).rejects.toBe(error);
    expect(f.service.persistAiUsage).not.toHaveBeenCalled();
    expect(f.wrongProvider).not.toHaveBeenCalled();
  });
});
