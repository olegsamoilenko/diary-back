import { scheduleServerDebugTask } from '../entry-flow-debug';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import {
  formatAiRequestDebug,
  writeAiRequestDebug,
  summarizeAiCacheRequest,
  compareAiCacheRequests,
  aiProviderCacheMetadata,
  getAiDebugFetch,
} from './ai-request-debug';
import { writeContextAudit } from '../../logs/context-audit';

jest.mock('../../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

jest.mock('../entry-flow-debug', () => ({
  scheduleServerDebugTask: jest.fn(),
}));
const previousEnvironment = process.env.NODE_ENV;
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NODE_ENV = previousEnvironment;
  jest.clearAllMocks();
});

describe('cache diagnostic evidence', () => {
  it('distinguishes missing cache-write usage from a reported zero', () => {
    const missing = aiProviderCacheMetadata({
      usage: { prompt_tokens_details: { cached_tokens: 3968 } },
    });
    expect(missing.cacheFields.cache_write_tokens).toEqual({
      reported: false,
      value: null,
    });
    const zero = aiProviderCacheMetadata({
      usage: { prompt_tokens_details: { cache_write_tokens: 0 } },
    });
    expect(zero.cacheFields.cache_write_tokens).toEqual({
      reported: true,
      value: 0,
    });
  });
  it('finds changed format or image bytes even when the text prefix is identical', () => {
    const base = {
      model: 'gpt-5.6-terra',
      messages: [
        { role: 'system', content: 'shared' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,AAA' },
            },
          ],
        },
      ],
    };
    const initial = summarizeAiCacheRequest({
      ...base,
      response_format: { type: 'json_object' },
    });
    const dialog = summarizeAiCacheRequest(base);
    expect(compareAiCacheRequests(initial, dialog)).toMatchObject({
      identicalLeadingMessages: 2,
      changedSettings: ['response_format'],
    });
    const changed = summarizeAiCacheRequest(
      JSON.parse(JSON.stringify(base).replace('base64,AAA', 'base64,BBB')),
    );
    expect(
      compareAiCacheRequests(dialog, changed).identicalLeadingMessages,
    ).toBe(1);
    expect(JSON.stringify(initial)).not.toContain('base64');
  });
  it('keeps changed cache markers distinct from changed message content', () => {
    const content = { type: 'text', text: 'same' };
    const before = summarizeAiCacheRequest({
      messages: [{ role: 'user', content: [content] }],
    });
    const after = summarizeAiCacheRequest({
      messages: [
        {
          role: 'user',
          content: [
            { ...content, prompt_cache_breakpoint: { mode: 'explicit' } },
          ],
        },
      ],
    });
    expect(before.messages[0].wireHash).not.toBe(after.messages[0].wireHash);
    expect(compareAiCacheRequests(before, after).identicalLeadingMessages).toBe(
      1,
    );
  });
  it('records safe HTTP evidence without consuming the response or exposing authorization', async () => {
    process.env.NODE_ENV = 'development';
    const response = new Response('untouched stream', {
      headers: { 'x-request-id': 'req-test', 'set-cookie': 'secret-cookie' },
    });
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(response);
    globalThis.fetch = fetchMock;
    const wrapped = getAiDebugFetch()!;
    const init = {
      headers: {
        Authorization: 'Bearer secret-key',
        'X-Client-Request-Id': 'request-file',
      },
      body: JSON.stringify({ model: 'model', messages: [] }),
    };
    expect(
      await wrapped('https://api.openai.com/v1/chat/completions', init),
    ).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      init,
    );
    expect(response.bodyUsed).toBe(false);
    const calls = JSON.stringify(jest.mocked(writeContextAudit).mock.calls);
    expect(calls).toContain('req-test');
    expect(calls).not.toContain('secret-key');
    expect(calls).not.toContain('secret-cookie');
    process.env.NODE_ENV = 'production';
    expect(getAiDebugFetch()).toBeUndefined();
  });
});

describe('provider request reading copy', () => {
  it('shows full ordered input, decoded source data and boundary without mutating wire content', () => {
    const prefix =
      '**SOURCE CONTEXT:**\n' +
      JSON.stringify({
        currentSource: 'Title: Тест\nContent: Текст',
        memory: [{ role: 'system', content: 'Memory\nSecond line' }],
      });
    const payload = {
      model: 'qwen3.8-max',
      stream: true,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prefix + '\n\nTASK' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Latest question' },
      ],
    };
    const before = JSON.stringify(payload);
    const result = formatAiRequestDebug({
      mode: 'dialog',
      payload,
      stablePrefix: prefix,
    });
    expect(JSON.stringify(payload)).toBe(before);
    expect(result).toContain('Title: Тест\nContent: Текст');
    expect(result).toContain('Memory\nSecond line');
    expect(result.indexOf('КІНЕЦЬ СПІЛЬНОГО ПРЕФІКСА')).toBeLessThan(
      result.indexOf('TASK'),
    );
    expect(result.indexOf('Earlier answer')).toBeLessThan(
      result.indexOf('Latest question'),
    );
    expect(result).not.toContain('json_object');
    expect(result).not.toContain('qwen3.8-max');
  });
  it('renders period entities separately, retaining empty, false and zero values without changing the request', () => {
    const context = {
      snapshot: {
        days: [
          {
            day: '2026-09-07',
            entries: [
              {
                title: 'Ранковий',
                metrics: [{ name: 'Energy', value: 0, scale: [1, 5] }],
              },
              { title: 'Перед сном', text: 'Line one\nLine two' },
            ],
            tasks: [
              {
                title: 'Презентація',
                descriptionItems: [
                  { text: 'Structure', checked: true },
                  { text: 'Figures', checked: false },
                ],
              },
            ],
          },
        ],
        goals: [],
        previousAnalyses: [],
      },
    };
    const payload = {
      messages: [{ role: 'user', content: JSON.stringify(context) }],
    };
    const before = JSON.stringify(payload);
    const result = formatAiRequestDebug({ mode: 'entry', payload });
    expect(result).toContain('Записи та чекіни (entries) — 2');
    expect(result).toContain('1 — Ранковий');
    expect(result).toContain('2 — Перед сном');
    expect(result).toContain('**checked:** false');
    expect(result).toContain('**checked:** true');
    expect(result).toContain('**value:** 0');
    expect(result).toContain('**scale:** [1,5]');
    expect(result).toContain('**Цілі (goals):** []');
    expect(result).not.toContain('[0]');
    expect(JSON.stringify(payload)).toBe(before);
  });
  it('shows system and message text, leaving cache metadata in the technical payload', () => {
    for (const marker of [
      { cache_control: { type: 'ephemeral', ttl: '5m' } },
      { prompt_cache_breakpoint: { mode: 'explicit' } },
    ]) {
      const block = { type: 'text', text: 'Shared', ...marker };
      const payload = {
        system: [block],
        messages: [{ role: 'assistant', content: [block] }],
      };
      const result = formatAiRequestDebug({
        mode: 'checkin_dialog',
        payload,
        stablePrefix: 'Shared',
      });
      expect(result).not.toContain(Object.keys(marker)[0]);
      expect(JSON.stringify(payload)).toContain(Object.keys(marker)[0]);
      expect(result).toContain('SYSTEM (окреме поле провайдера)');
      expect(result).toContain('ASSISTANT');
    }
  });
  it('does not schedule any request logging in production', () => {
    process.env.NODE_ENV = 'production';
    writeAiRequestDebug({ mode: 'entry', payload: { messages: [] } });
    expect(scheduleServerDebugTask).not.toHaveBeenCalled();
  });
  it('schedules complete development evidence without changing the payload', () => {
    process.env.NODE_ENV = 'development';
    writeAiRequestDebug({ mode: 'entry', payload: { messages: [] } });
    expect(scheduleServerDebugTask).toHaveBeenCalledTimes(1);
  });
});
