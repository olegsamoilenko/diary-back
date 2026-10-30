import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AiService } from '../ai.service';
import { AiGateway } from './ai.gateway';
import { AiModel } from '../../users/types';

jest.mock('../entry-flow-debug', () => ({
  logServerEntryTiming: jest.fn(),
  logServerMemoryReview: jest.fn(),
  scheduleServerDebugTask: jest.fn(),
  writeFullServerDebugLog: jest.fn(),
}));
jest.mock('../utils/ai-request-debug', () => ({
  ...jest.requireActual<typeof import('../utils/ai-request-debug')>(
    '../utils/ai-request-debug',
  ),
  writeAiRequestDebug: jest.fn(),
}));

type Mode = 'entry' | 'checkin' | 'dialog' | 'checkin_dialog';
const cases: [Mode, boolean][] = [
  ['entry', false],
  ['entry', true],
  ['checkin', false],
  ['checkin', true],
  ['dialog', false],
  ['checkin_dialog', false],
];

function fixture(mode: Mode, structured: boolean) {
  const client: any = new EventEmitter();
  client.user = { id: 42 };
  client.data = {};
  client.disconnected = false;
  const emit = jest.spyOn(client, 'emit');
  const disconnect = () => {
    client.disconnected = true;
    client.emit('disconnect');
  };
  const ai: any = Object.create(AiService.prototype);
  ai.usersService = {
    findById: jest.fn(async () => ({
      id: 42,
      name: 'Test',
      settings: {
        shortAiReflectionEnabled: structured,
        conversationLanguage: 'en',
      },
    })),
  };
  ai.getStylesBlock = jest.fn(async () => '');
  ai.subscriptionUsageService = {
    getEffectiveAiBasePlanId: jest.fn(async () => null),
    assertRequestAffordable: jest.fn(async () => {}),
  };
  ai.countOpenAiTokens = jest.fn(() => 50);
  ai.countStringTokens = jest.fn(() => 7);
  ai.persistAiUsage = jest.fn(async () => {});
  ai.logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const reporter = { report: jest.fn() };
  ai.aiErrorReporter = reporter;
  const monitoring = { captureSafely: jest.fn() };
  const gateway = new AiGateway(
    ai,
    {} as never,
    {} as never,
    monitoring as never,
    reporter as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const prefix =
    mode === 'entry'
      ? 'ai_stream_comment'
      : mode === 'checkin'
        ? 'ai_stream_checkin'
        : 'ai_stream_dialog';
  const payload: any = {
    content: 'Synthetic source',
    aiModel: AiModel.GPT_5_6_TERRA,
    mood: '',
    userMemory: { role: 'system', content: '' },
    assistantMemory: { role: 'system', content: '' },
    assistantCommitment: { role: 'system', content: '' },
    entryContent: { role: 'user', content: 'Synthetic entry' },
    entryAiComment: { role: 'assistant', content: 'Earlier reflection' },
    prompt: [],
    goalsPrompt: '',
    metrics: null,
    timeContext: { timeZone: 'UTC', nowLocalText: '2026-10-29', locale: 'en' },
    supportsStructuredProgress: structured,
    mode,
  };
  const run = () =>
    mode === 'entry'
      ? gateway.handleStreamAiComment(payload, client)
      : mode === 'checkin'
        ? gateway.handleStreamAiCheckin(payload, client)
        : gateway.handleStreamAiDialog(payload, client);
  return {
    ai,
    client,
    emit,
    disconnect,
    reporter,
    monitoring,
    prefix,
    payload,
    run,
  };
}

function providerFixture(
  f: ReturnType<typeof fixture>,
  options: {
    cancel?: 'partial' | 'before-text';
    actual?: boolean;
    fail?: boolean;
  } = {},
) {
  const state = { signal: undefined as AbortSignal | undefined, closed: false };
  const create = jest.fn(async (params: any, sdk: any) => {
    state.signal = sdk?.signal;
    return (async function* () {
      try {
        if (options.fail) throw new Error('provider unavailable');
        if (options.cancel === 'before-text') {
          if (options.actual)
            yield {
              choices: [],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
              },
            };
          f.disconnect();
          throw new Error('transport closed');
        }
        const text = params.response_format
          ? '{"shortText":"Partial","fullText":"Full","tags":[]}'
          : 'Partial';
        yield {
          choices: [{ delta: { content: text }, finish_reason: 'stop' }],
          ...(options.actual
            ? {
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 20,
                  total_tokens: 120,
                  prompt_tokens_details: { cached_tokens: 80 },
                },
              }
            : {}),
        };
        if (options.cancel === 'partial') {
          f.disconnect();
          state.signal?.throwIfAborted();
          // The old unconnected adapter has no signal and loses this usage.
          yield { choices: [{ delta: { content: 'late' } }] };
        }
      } finally {
        state.closed = true;
      }
    })();
  });
  f.ai.openai = { chat: { completions: { create } } };
  f.ai.getQwenClient = () => f.ai.openai;
  return { create, state };
}

function expectNoCompletion(f: ReturnType<typeof fixture>) {
  expect(f.emit).not.toHaveBeenCalledWith(
    `${f.prefix}_done`,
    expect.anything(),
  );
  expect(f.emit).not.toHaveBeenCalledWith(
    `${f.prefix}_error`,
    expect.anything(),
  );
  expect(f.monitoring.captureSafely).not.toHaveBeenCalled();
  expect(f.client.listenerCount('disconnect')).toBe(0);
}

describe('NA58 real gateway -> generateComment -> provider -> usage lifecycle', () => {
  it.each(cases)(
    'accounts partial %s output (structured=%s) before cancellation',
    async (mode, structured) => {
      const f = fixture(mode, structured);
      const p = providerFixture(f, { cancel: 'partial' });
      await f.run();
      expect(p.state.signal?.aborted).toBe(true);
      expect(p.state.closed).toBe(true);
      expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
      expect(f.ai.persistAiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 50,
          outputTokens: 7,
          estimated: true,
          finishReason: 'cancelled',
        }),
      );
      expect(f.emit).toHaveBeenCalledWith(
        `${f.prefix}_chunk`,
        expect.anything(),
      );
      expect(f.emit).not.toHaveBeenCalledWith(`${f.prefix}_chunk`, {
        text: 'late',
      });
      expectNoCompletion(f);
    },
  );

  it.each(cases)(
    'preserves successful %s response and billing (structured=%s)',
    async (mode, structured) => {
      const f = fixture(mode, structured);
      providerFixture(f, { actual: true });
      await f.run();
      expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
      expect(f.ai.persistAiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 100,
          cachedInputTokens: 80,
          outputTokens: 20,
          estimated: false,
        }),
      );
      expect(f.emit).toHaveBeenCalledWith(
        `${f.prefix}_done`,
        expect.objectContaining({ content: expect.any(String) }),
      );
      expect(f.monitoring.captureSafely).toHaveBeenCalledTimes(1);
      expect(f.client.listenerCount('disconnect')).toBe(0);
    },
  );

  it.each([false, true])(
    'cancels before text, charging only provider-reported usage (actual=%s)',
    async (actual) => {
      const f = fixture('checkin', true);
      const p = providerFixture(f, { cancel: 'before-text', actual });
      await f.run();
      expect(p.state.signal?.aborted).toBe(true);
      expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(actual ? 1 : 0);
      if (actual)
        expect(f.ai.persistAiUsage).toHaveBeenCalledWith(
          expect.objectContaining({
            inputTokens: 100,
            outputTokens: 20,
            estimated: false,
          }),
        );
      expectNoCompletion(f);
    },
  );

  it('preserves actual usage received before a partial-response disconnect', async () => {
    const f = fixture('entry', true);
    providerFixture(f, { cancel: 'partial', actual: true });
    await f.run();
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
    expect(f.ai.persistAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 20,
        estimated: false,
      }),
    );
    expectNoCompletion(f);
  });

  it('keeps ordinary provider failure an error, not successful cancellation', async () => {
    const f = fixture('entry', true);
    const p = providerFixture(f, { fail: true });
    await f.run();
    expect(p.state.signal?.aborted).toBe(false);
    expect(f.ai.persistAiUsage).not.toHaveBeenCalled();
    expect(f.reporter.report).toHaveBeenCalledTimes(1);
    expect(f.emit).toHaveBeenCalledWith(`${f.prefix}_error`, expect.anything());
    expect(f.emit).not.toHaveBeenCalledWith(
      `${f.prefix}_done`,
      expect.anything(),
    );
    expect(f.client.listenerCount('disconnect')).toBe(0);
  });

  it.each<Mode>(['entry', 'checkin', 'dialog', 'checkin_dialog'])(
    'does not start %s for an already disconnected client',
    async (mode) => {
      const f = fixture(mode, true);
      const p = providerFixture(f);
      f.client.disconnected = true;
      await f.run();
      expect(p.create).not.toHaveBeenCalled();
      expect(f.ai.usersService.findById).not.toHaveBeenCalled();
      expect(f.ai.persistAiUsage).not.toHaveBeenCalled();
      expectNoCompletion(f);
    },
  );

  it('stops preparation after a disconnect during user lookup', async () => {
    const f = fixture('entry', true);
    const p = providerFixture(f);
    f.ai.usersService.findById.mockImplementationOnce(async () => {
      f.disconnect();
      return { id: 42, settings: {} };
    });
    await f.run();
    expect(f.ai.getStylesBlock).not.toHaveBeenCalled();
    expect(p.create).not.toHaveBeenCalled();
    expectNoCompletion(f);
  });

  it('allows a fresh request after cancellation with no stale disconnect listener', async () => {
    const f = fixture('entry', true);
    providerFixture(f, { cancel: 'partial' });
    await f.run();
    expectNoCompletion(f);
    f.client.disconnected = false;
    const p = providerFixture(f, { actual: true });
    await f.run();
    expect(p.state.signal?.aborted).toBe(false);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(2);
    expect(f.emit).toHaveBeenCalledWith(`${f.prefix}_done`, expect.anything());
    expect(f.client.listenerCount('disconnect')).toBe(0);
  });

  it('connects Qwen structured check-in cancellation to the same accounting', async () => {
    const f = fixture('checkin', true);
    f.payload.aiModel = AiModel.QWEN_3_8_MAX;
    const p = providerFixture(f, { cancel: 'partial' });
    await f.run();
    expect(p.state.signal?.aborted).toBe(true);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
    expectNoCompletion(f);
  });

  it('accounts received Claude usage when structured entry streaming is cancelled', async () => {
    const f = fixture('entry', true);
    f.payload.aiModel = AiModel.CLAUDE_OPUS_5;
    let signal: AbortSignal | undefined;
    let closed = false;
    f.ai.anthropic = {
      messages: {
        create: jest.fn(async (_params: unknown, sdk: any) => {
          signal = sdk?.signal;
          return (async function* () {
            try {
              yield {
                type: 'message_start',
                message: {
                  usage: {
                    input_tokens: 100,
                    output_tokens: 5,
                    cache_read_input_tokens: 80,
                  },
                },
              };
              yield {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: '{"shortText":"Partial',
                },
              };
              f.disconnect();
              throw new Error('transport closed');
            } finally {
              closed = true;
            }
          })();
        }),
      },
    };
    await f.run();
    expect(signal?.aborted).toBe(true);
    expect(closed).toBe(true);
    expect(f.ai.persistAiUsage).toHaveBeenCalledTimes(1);
    expect(f.ai.persistAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 180,
        cachedInputTokens: 80,
        outputTokens: 5,
        estimated: false,
        finishReason: 'cancelled',
      }),
    );
    expectNoCompletion(f);
  });
});
