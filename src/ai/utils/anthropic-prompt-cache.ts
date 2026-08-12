type CacheableMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AnthropicCacheTextBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl: '5m' };
};

export type AnthropicCacheMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicCacheTextBlock[];
};

type AnthropicUsageWithCache = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function buildAnthropicPromptCachePayload(
  messages: CacheableMessage[],
  stableSystemPrefix?: string,
  additionalBreakpointMessageIndexes: number[] = [],
): {
  system: string | AnthropicCacheTextBlock[];
  messages: AnthropicCacheMessage[];
} {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  const normalizedPrefix = stableSystemPrefix?.trim() ?? '';
  const useSystemCacheBreakpoint =
    normalizedPrefix.length > 0 && system.startsWith(normalizedPrefix);
  const systemPayload: string | AnthropicCacheTextBlock[] =
    useSystemCacheBreakpoint
      ? [
          {
            type: 'text',
            text: normalizedPrefix,
            cache_control: { type: 'ephemeral', ttl: '5m' },
          },
          ...(system.length > normalizedPrefix.length
            ? [
                {
                  type: 'text' as const,
                  text: system.slice(normalizedPrefix.length),
                },
              ]
            : []),
        ]
      : system;

  const breakpointIndexes = new Set(
    additionalBreakpointMessageIndexes.filter(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < messages.length,
    ),
  );
  const claudeMessages: AnthropicCacheMessage[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'system') return;
    const role = message.role;
    if (!breakpointIndexes.has(index)) {
      claudeMessages.push({ role, content: message.content });
      return;
    }
    claudeMessages.push({
      role,
      content: [
        {
          type: 'text',
          text: message.content,
          cache_control: { type: 'ephemeral', ttl: '5m' },
        },
      ],
    });
  });

  return { system: systemPayload, messages: claudeMessages };
}

export function getAnthropicTokenUsage(usage: unknown): {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
} | null {
  if (!usage || typeof usage !== 'object') return null;
  const typed = usage as AnthropicUsageWithCache;
  if (
    typeof typed.input_tokens !== 'number' ||
    typeof typed.output_tokens !== 'number'
  ) {
    return null;
  }

  const uncachedInputTokens = Math.max(0, Math.trunc(typed.input_tokens));
  const cachedInputTokens = Math.max(
    0,
    Math.trunc(typed.cache_read_input_tokens ?? 0),
  );
  const cacheWriteInputTokens = Math.max(
    0,
    Math.trunc(typed.cache_creation_input_tokens ?? 0),
  );

  return {
    inputTokens:
      uncachedInputTokens + cachedInputTokens + cacheWriteInputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens: Math.max(0, Math.trunc(typed.output_tokens)),
  };
}
