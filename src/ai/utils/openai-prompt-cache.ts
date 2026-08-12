import { createHash } from 'node:crypto';

const PROMPT_CACHE_BUCKETS = 32;

type OpenAiUsageWithCache = {
  prompt_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  } | null;
};

type CacheableMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAiExplicitCacheMessage = Omit<CacheableMessage, 'content'> & {
  content:
    | string
    | Array<{
        type: 'text';
        text: string;
        prompt_cache_breakpoint?: { mode: 'explicit' };
      }>;
};

export function buildOpenAiPromptCacheKey(params: {
  modelId: string;
  scope: string;
  userId: number;
  resourceId?: string;
}): string {
  const bucket = Math.abs(Math.trunc(params.userId)) % PROMPT_CACHE_BUCKETS;
  const model = params.modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const scope = params.scope.replace(/[^a-zA-Z0-9._-]/g, '_');

  const resourceHash = params.resourceId
    ? buildOpenAiPromptCacheResourceHash(params.resourceId)
    : '';

  return `nemory:${model}:${scope}:v2:b${bucket}${resourceHash ? `:r${resourceHash}` : ''}`.slice(
    0,
    64,
  );
}

export function buildOpenAiPromptCacheResourceHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function getCachedInputTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;

  const typed = usage as OpenAiUsageWithCache;
  const promptTokens = Math.max(0, Math.trunc(typed.prompt_tokens ?? 0));
  const cachedTokens = Math.max(
    0,
    Math.trunc(typed.prompt_tokens_details?.cached_tokens ?? 0),
  );

  return Math.min(promptTokens, cachedTokens);
}

export function getCacheWriteInputTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;

  const typed = usage as OpenAiUsageWithCache;
  const promptTokens = Math.max(0, Math.trunc(typed.prompt_tokens ?? 0));
  const cacheWriteTokens = Math.max(
    0,
    Math.trunc(typed.prompt_tokens_details?.cache_write_tokens ?? 0),
  );

  return Math.min(promptTokens, cacheWriteTokens);
}

export function supportsExplicitPromptCaching(modelId: string): boolean {
  return /^gpt-5\.6(?:-|$)/i.test(modelId.trim());
}

export function getOpenAiPromptCacheOptions(
  modelId: string,
): { mode: 'explicit' } | undefined {
  return supportsExplicitPromptCaching(modelId)
    ? { mode: 'explicit' }
    : undefined;
}

export function shouldUseResponsePromptCache(mode: string): boolean {
  return mode === 'dialog' || mode === 'checkin_dialog';
}

export function addExplicitPromptCacheBreakpoint(
  messages: CacheableMessage[],
  stablePrefix: string,
  additionalBreakpointMessageIndexes: number[] = [],
): OpenAiExplicitCacheMessage[] {
  const normalizedPrefix = stablePrefix.trim();
  if (!normalizedPrefix) return messages;

  const additionalIndexes = new Set(
    additionalBreakpointMessageIndexes.filter(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < messages.length,
    ),
  );
  let applied = false;
  return messages.map((message, index) => {
    if (
      !applied &&
      message.role === 'system' &&
      message.content.startsWith(normalizedPrefix)
    ) {
      applied = true;
      const dynamicSuffix = message.content.slice(normalizedPrefix.length);
      const content: Array<{
        type: 'text';
        text: string;
        prompt_cache_breakpoint?: { mode: 'explicit' };
      }> = [
        {
          type: 'text',
          text: normalizedPrefix,
          prompt_cache_breakpoint: { mode: 'explicit' },
        },
      ];
      if (dynamicSuffix) content.push({ type: 'text', text: dynamicSuffix });

      return { ...message, content };
    }

    if (additionalIndexes.has(index) && message.content.length > 0) {
      return {
        ...message,
        content: [
          {
            type: 'text',
            text: message.content,
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
      };
    }

    return message;
  });
}
