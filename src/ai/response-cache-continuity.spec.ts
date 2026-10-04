import { describe, expect, it, jest } from '@jest/globals';
import {
  AiService,
  type AiResponseRequest,
  type AiContentMode,
} from './ai.service';
import { AiModel } from '../users/types';
import type { OpenAiMessage } from './types';
import {
  addExplicitPromptCacheBreakpoint,
  getCacheWriteInputTokens,
} from './utils/openai-prompt-cache';
import { buildAnthropicPromptCachePayload } from './utils/anthropic-prompt-cache';

jest.mock('./entry-flow-debug', () => ({
  logServerMemoryReview: jest.fn(),
  scheduleServerDebugTask: jest.fn(),
  writeFullServerDebugLog: jest.fn(),
}));

function fixture() {
  const service = Object.create(AiService.prototype) as AiService;
  const execute = jest.fn<(request: AiResponseRequest) => Promise<unknown>>(
    async () => ({
      fullText: '{"shortText":"Short","fullText":"Full","tags":[]}',
      finishReason: 'stop',
      estimated: false,
    }),
  );
  Object.assign(service, {
    usersService: {
      findById: async () => ({
        name: 'Test',
        settings: {
          conversationLanguage: 'uk',
          shortAiReflectionEnabled: true,
        },
      }),
    },
    subscriptionUsageService: { getEffectiveAiBasePlanId: async () => null },
    getStylesBlock: async () => 'Tone: warm',
    executeResponse: execute,
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  });
  const time = {
    timeZone: 'Europe/Kyiv',
    nowLocalText: '2026-09-20 12:00',
    locale: 'uk-UA',
  };
  const source: OpenAiMessage = {
    role: 'user',
    content:
      'Current journal entry (2026-09-20 11:00):\nContent: Original\nMood: calm',
  };
  const answer: OpenAiMessage = {
    role: 'assistant',
    content: 'Original reflection',
  };
  const context: OpenAiMessage[] = [
    { role: 'system', content: '[MEMORY_CAPSULES_V2]\nSaved context' },
  ];
  const generate = async (
    mode: AiContentMode,
    history: OpenAiMessage[] = [],
    memory = context,
    question = 'Question',
    requestTime = time,
  ) => {
    await service.generateComment(
      1,
      'About',
      { role: 'system', content: '' },
      { role: 'system', content: '' },
      { role: 'system', content: '' },
      memory,
      'Goals',
      question,
      requestTime,
      AiModel.GPT_5_6_TERRA,
      'calm',
      () => {},
      mode,
      { energy: 3, focus: 3, stress: 2, motivation: 4, sleepQuality: 3 },
      mode.includes('dialog') ? source : undefined,
      mode.includes('dialog') ? answer : undefined,
      history,
      false,
      true,
      undefined,
      false,
      'memory_capsules_v2',
      Date.UTC(2026, 8, 20, 8),
    );
    return execute.mock.calls.at(-1)![0];
  };
  return { generate, source, answer, time };
}
function lastIndex(request: AiResponseRequest) {
  return Math.max(...(request.cache?.messageIndexes ?? [0]));
}
function prefix(request: AiResponseRequest, index: number) {
  return request.messages.slice(0, index + 1);
}

describe('source and dialog cache continuity', () => {
  it.each(['dialog', 'checkin_dialog'] as const)(
    'replays the complete previous %s request with its original time',
    async (mode) => {
      const f = fixture();
      const text = ' <b>Question</b>&nbsp;one ';
      const first = await f.generate(mode, [], undefined, text);
      const next = await f.generate(
        mode,
        [
          { role: 'user', content: 'Q: ' + text, timeContext: f.time },
          { role: 'assistant', content: 'A: Answer' },
        ],
        undefined,
        'Next',
        { ...f.time, nowLocalText: '2026-09-21 18:00' },
      );
      expect(next.messages.slice(0, first.messages.length)).toEqual(
        first.messages,
      );
      expect(next.messages.at(-1)?.content).toContain('2026-09-21 18:00');
      expect(JSON.stringify(next.messages)).not.toContain('timeContext');
      const legacy = await f.generate(mode, [
        { role: 'user', content: 'Q: Old question' },
      ]);
      expect(legacy.messages.at(-2)).toEqual({
        role: 'user',
        content: 'Q: Old question',
      });
    },
  );
  it.each<[AiContentMode, AiContentMode]>([
    ['entry', 'dialog'],
    ['checkin', 'checkin_dialog'],
  ])(
    'reuses %s context and grows %s history without initial analysis rules',
    async (mode, dialog) => {
      const f = fixture();
      const initial = await f.generate(mode);
      const first = await f.generate(dialog);
      const contextEnd = lastIndex(initial);
      expect(prefix(first, contextEnd)).toEqual(prefix(initial, contextEnd));
      expect(first.cache?.key).toBe(initial.cache?.key);
      expect(first.cache?.messageIndexes).toContain(contextEnd);
      expect(
        first.messages.find((m) => m.content.startsWith('[RESPONSE_TASK]'))
          ?.content,
      ).toContain('not a new analysis');
      expect(first.messages.map((m) => m.content).join('\n')).not.toContain(
        'MODE: RESPONSE TO',
      );
      expect(
        initial.messages.filter((m) => m.content.includes('energy')),
      ).toHaveLength(1);
      const history: OpenAiMessage[] = [];
      let previous = first;
      for (let turn = 1; turn <= 7; turn++) {
        history.push(
          { role: 'user', content: `Q: question ${turn}` },
          { role: 'assistant', content: `A: answer ${turn}` },
        );
        const next = await f.generate(dialog, history);
        expect(prefix(next, lastIndex(previous))).toEqual(
          prefix(previous, lastIndex(previous)),
        );
        expect(next.cache?.messageIndexes).toContain(lastIndex(previous));
        expect(lastIndex(next)).toBeGreaterThan(lastIndex(previous));
        expect(next.cache?.key).toBe(first.cache?.key);
        expect(next.cache!.messageIndexes!.length + 1).toBeLessThanOrEqual(4);
        previous = next;
      }
      const newSource = await f.generate(
        mode,
        [],
        [{ role: 'system', content: 'New saved context' }],
      );
      expect(newSource.cache?.key).not.toBe(initial.cache?.key);
      expect(
        newSource.messages.some((m) => m.content.startsWith('A: answer')),
      ).toBe(false);
    },
  );

  it('puts volatile current time only after the cache boundaries', async () => {
    const f = fixture();
    for (const mode of ['entry', 'dialog'] as const) {
      const request = await f.generate(mode);
      expect(
        prefix(request, lastIndex(request)).some((m) =>
          m.content.includes('2026-09-20 12:00'),
        ),
      ).toBe(false);
      expect(request.messages.at(-1)?.content).toContain('2026-09-20 12:00');
    }
  });

  it('preserves context/task order and explicit markers for OpenAI and Claude', async () => {
    const request = await fixture().generate('dialog');
    const { messages, cache } = request;
    const openai = addExplicitPromptCacheBreakpoint(
      messages,
      cache!.openAiPrefix!,
      cache!.messageIndexes,
    );
    const claude = buildAnthropicPromptCachePayload(
      messages,
      cache!.anthropicPrefix,
      cache!.messageIndexes,
    );
    const text = (content: unknown) =>
      typeof content === 'string'
        ? content
        : (content as { text: string }[]).map((b) => b.text).join('');
    expect(openai.map((m) => text(m.content))).toEqual(
      messages.map((m) => m.content),
    );
    expect(claude.messages.map((m) => text(m.content))).toEqual(
      messages.slice(1).map((m) => m.content),
    );
    expect(text(claude.system)).not.toContain('[RESPONSE_TASK]');
    expect(JSON.stringify(openai)).toContain('prompt_cache_breakpoint');
    expect(
      getCacheWriteInputTokens({
        prompt_tokens: 1000,
        prompt_tokens_details: { cache_creation_input_tokens: 700 },
      }),
    ).toBe(700);
  });
});
