import { describe, expect, it } from '@jest/globals';
import {
  addExplicitPromptCacheBreakpoint,
  buildOpenAiPromptCacheKey,
  buildOpenAiPromptCacheResourceHash,
  getCacheWriteInputTokens,
  getCachedInputTokens,
  getOpenAiPromptCacheOptions,
  shouldUseResponsePromptCache,
  supportsExplicitPromptCaching,
} from './openai-prompt-cache';

describe('OpenAI prompt cache helpers', () => {
  it('builds a stable, bounded cache-routing key', () => {
    const first = buildOpenAiPromptCacheKey({
      modelId: 'gpt-5.6-terra',
      scope: 'dialog',
      userId: 35,
    });
    const second = buildOpenAiPromptCacheKey({
      modelId: 'gpt-5.6-terra',
      scope: 'dialog',
      userId: 67,
    });

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it('isolates dialog cache routing by stable record context', () => {
    const first = buildOpenAiPromptCacheKey({
      modelId: 'gpt-5.6-terra',
      scope: 'dialog',
      userId: 1,
      resourceId: 'record-a-context',
    });
    const repeated = buildOpenAiPromptCacheKey({
      modelId: 'gpt-5.6-terra',
      scope: 'dialog',
      userId: 1,
      resourceId: 'record-a-context',
    });
    const other = buildOpenAiPromptCacheKey({
      modelId: 'gpt-5.6-terra',
      scope: 'dialog',
      userId: 1,
      resourceId: 'record-b-context',
    });

    expect(first).toBe(repeated);
    expect(first).not.toBe(other);
    expect(first).toContain(
      buildOpenAiPromptCacheResourceHash('record-a-context'),
    );
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it('reads and clamps explicit cache-write usage', () => {
    expect(
      getCacheWriteInputTokens({
        prompt_tokens: 1_000,
        prompt_tokens_details: { cache_write_tokens: 800 },
      }),
    ).toBe(800);
    expect(
      getCacheWriteInputTokens({
        prompt_tokens: 1_000,
        prompt_tokens_details: { cache_write_tokens: 2_000 },
      }),
    ).toBe(1_000);
  });

  it('adds one explicit breakpoint after the reusable system prefix', () => {
    const messages = [
      { role: 'system' as const, content: 'stable\n\ndynamic' },
      { role: 'user' as const, content: 'current entry' },
    ];

    expect(addExplicitPromptCacheBreakpoint(messages, 'stable')).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'stable',
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
          { type: 'text', text: '\n\ndynamic' },
        ],
      },
      messages[1],
    ]);
  });

  it('adds a second explicit breakpoint after reusable dialog base context', () => {
    const messages = [
      { role: 'system' as const, content: 'stable\n\ndynamic' },
      { role: 'system' as const, content: 'stored V2 capsules' },
      { role: 'user' as const, content: 'current entry' },
      { role: 'assistant' as const, content: 'initial reflection' },
      { role: 'user' as const, content: 'Q: follow-up' },
    ];

    const result = addExplicitPromptCacheBreakpoint(messages, 'stable', [3]);

    expect(result[3]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'initial reflection',
          prompt_cache_breakpoint: { mode: 'explicit' },
        },
      ],
    });
    expect(result[4]).toBe(messages[4]);
  });

  it('uses explicit caching only for GPT-5.6 model ids', () => {
    expect(supportsExplicitPromptCaching('gpt-5.6-terra')).toBe(true);
    expect(supportsExplicitPromptCaching('gpt-5.6')).toBe(true);
    expect(supportsExplicitPromptCaching('gpt-5.4')).toBe(false);
  });

  it('forces explicit cache policy for GPT-5.6 even without breakpoints', () => {
    expect(getOpenAiPromptCacheOptions('gpt-5.6-terra')).toEqual({
      mode: 'explicit',
    });
    expect(getOpenAiPromptCacheOptions('gpt-5.6-luna')).toEqual({
      mode: 'explicit',
    });
    expect(getOpenAiPromptCacheOptions('gpt-5.4')).toBeUndefined();
  });

  it('enables response prompt caching only for dialogs', () => {
    expect(shouldUseResponsePromptCache('entry')).toBe(false);
    expect(shouldUseResponsePromptCache('checkin')).toBe(false);
    expect(shouldUseResponsePromptCache('dialog')).toBe(true);
    expect(shouldUseResponsePromptCache('checkin_dialog')).toBe(true);
  });

  it('reads and clamps cached input tokens from OpenAI usage', () => {
    expect(
      getCachedInputTokens({
        prompt_tokens: 1_000,
        prompt_tokens_details: { cached_tokens: 800 },
      }),
    ).toBe(800);
    expect(
      getCachedInputTokens({
        prompt_tokens: 1_000,
        prompt_tokens_details: { cached_tokens: 2_000 },
      }),
    ).toBe(1_000);
    expect(getCachedInputTokens(undefined)).toBe(0);
  });
});
