import { describe, expect, it } from '@jest/globals';
import {
  buildAnthropicPromptCachePayload,
  getAnthropicTokenUsage,
} from './anthropic-prompt-cache';

describe('Anthropic prompt cache helpers', () => {
  const messages = [
    { role: 'system' as const, content: 'stable\n\ndynamic' },
    { role: 'system' as const, content: 'stored memory' },
    { role: 'user' as const, content: 'current entry' },
    { role: 'assistant' as const, content: 'initial reflection' },
    { role: 'user' as const, content: 'follow-up question' },
  ];

  it('adds 5-minute breakpoints to the stable system prefix and dialog base', () => {
    expect(buildAnthropicPromptCachePayload(messages, 'stable', [3])).toEqual({
      system: [
        {
          type: 'text',
          text: 'stable',
          cache_control: { type: 'ephemeral', ttl: '5m' },
        },
        {
          type: 'text',
          text: '\n\ndynamic\n\n---\n\nstored memory',
        },
      ],
      messages: [
        { role: 'user', content: 'current entry' },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'initial reflection',
              cache_control: { type: 'ephemeral', ttl: '5m' },
            },
          ],
        },
        { role: 'user', content: 'follow-up question' },
      ],
    });
  });

  it('keeps an uncached payload unchanged when no prefix is provided', () => {
    expect(buildAnthropicPromptCachePayload(messages).system).toBe(
      'stable\n\ndynamic\n\n---\n\nstored memory',
    );
    expect(buildAnthropicPromptCachePayload(messages).messages).toEqual([
      { role: 'user', content: 'current entry' },
      { role: 'assistant', content: 'initial reflection' },
      { role: 'user', content: 'follow-up question' },
    ]);
  });

  it('returns total input and cache components from Anthropic usage', () => {
    expect(
      getAnthropicTokenUsage({
        input_tokens: 95,
        cache_read_input_tokens: 13_189,
        cache_creation_input_tokens: 0,
        output_tokens: 108,
      }),
    ).toEqual({
      inputTokens: 13_284,
      cachedInputTokens: 13_189,
      cacheWriteInputTokens: 0,
      outputTokens: 108,
    });
  });
});
