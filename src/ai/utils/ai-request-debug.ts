import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scheduleServerDebugTask } from '../entry-flow-debug';
import { createHash, randomUUID } from 'node:crypto';
import { writeContextAudit } from '../../logs/context-audit';

type DebugRequest = {
  mode: string;
  payload: object;
  stablePrefix?: string;
};

const cacheComparisons = new Map<
  string,
  {
    requestId: string;
    at: number;
    snapshot: ReturnType<typeof summarizeAiCacheRequest>;
  }
>();

/** Hashes reflect exact submitted content, not provider-side tokenization. */
export function summarizeAiCacheRequest(payload: object) {
  const value = payload as Record<string, unknown>;
  const hash = (item: unknown) =>
    createHash('sha256').update(JSON.stringify(item)).digest('hex');
  const withoutMarkers = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(withoutMarkers);
    if (!isRecord(item)) return item;
    return Object.fromEntries(
      Object.entries(item)
        .filter(
          ([key]) =>
            !['prompt_cache_breakpoint', 'cache_control'].includes(key),
        )
        .map(([key, child]) => [key, withoutMarkers(child)]),
    );
  };
  const messages = Array.isArray(value.messages)
    ? value.messages
    : Array.isArray(value.input)
      ? value.input
      : [];
  return {
    payloadHash: hash(payload),
    settings: Object.fromEntries(
      [
        'model',
        'service_tier',
        'response_format',
        'reasoning_effort',
        'reasoning',
        'text',
        'tools',
        'tool_choice',
        'parallel_tool_calls',
        'prompt_cache_key',
        'prompt_cache_options',
      ].map((key) => [key, value[key] ?? null]),
    ),
    messages: messages.map((message: unknown) => ({
      role: isRecord(message) ? message.role : null,
      wireHash: hash(message),
      contentHash: hash(withoutMarkers(message)),
    })),
  };
}

export function compareAiCacheRequests(
  previous: ReturnType<typeof summarizeAiCacheRequest>,
  current: ReturnType<typeof summarizeAiCacheRequest>,
) {
  let identicalLeadingMessages = 0;
  while (
    identicalLeadingMessages <
      Math.min(previous.messages.length, current.messages.length) &&
    previous.messages[identicalLeadingMessages].contentHash ===
      current.messages[identicalLeadingMessages].contentHash
  ) {
    identicalLeadingMessages++;
  }
  return {
    identicalLeadingMessages,
    previousMessageCount: previous.messages.length,
    currentMessageCount: current.messages.length,
    changedSettings: Object.keys(current.settings).filter(
      (key) =>
        JSON.stringify(previous.settings[key]) !==
        JSON.stringify(current.settings[key]),
    ),
  };
}

/** Development-only transport evidence. Never log credentials or response bodies here. */
export function getAiDebugFetch(): typeof globalThis.fetch | undefined {
  if (process.env.NODE_ENV !== 'development') return undefined;
  const originalFetch = globalThis.fetch;
  return async (input, init) => {
    const response = await originalFetch(input, init);
    try {
      const headers = new Headers(init?.headers);
      const debugRequestId = headers.get('x-client-request-id');
      if (debugRequestId) {
        const url = new URL(
          typeof input === 'string' || input instanceof URL ? input : input.url,
        );
        const body =
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as object)
            : null;
        writeContextAudit('provider.http.response', {
          debugRequestId,
          endpoint: `${url.origin}${url.pathname}`,
          status: response.status,
          responseHeaders: Object.fromEntries(
            [
              'x-request-id',
              'openai-processing-ms',
              'openai-version',
              'content-type',
            ].map((key) => [key, response.headers.get(key)]),
          ),
          sentRequest: body ? summarizeAiCacheRequest(body) : null,
        });
      }
    } catch {
      // Diagnostics must never interrupt a generation or initiate another request.
    }
    return response;
  };
}

/** Preserve missing-vs-zero and returned routing metadata without duplicating text. */
export function aiProviderCacheMetadata(value: unknown) {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  const usage: Record<string, unknown> = isRecord(record.usage)
    ? record.usage
    : {};
  const details: Record<string, unknown> = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : {};
  return {
    metadata: Object.fromEntries(
      [
        'id',
        'model',
        'created',
        'service_tier',
        'system_fingerprint',
        'prompt_cache_options',
        'prompt_cache_diagnostics',
      ].map((key) => [key, record[key] ?? null]),
    ),
    cacheFields: Object.fromEntries(
      [
        'cached_tokens',
        'cache_write_tokens',
        'cache_creation_input_tokens',
      ].map((key) => [
        key,
        {
          reported: Object.hasOwn(details, key),
          value: details[key] ?? null,
        },
      ]),
    ),
  };
}

export function redactMediaDebug(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMediaDebug);
  if (!isRecord(value)) return value;
  if (
    value.type === 'input_image' &&
    typeof value.image_url === 'string' &&
    value.image_url.startsWith('data:')
  ) {
    const data = value.image_url;
    return {
      ...value,
      image_url: `[image omitted; ${data.length} characters; sha256 ${createHash('sha256').update(data).digest('hex')}]`,
    };
  }
  if (
    value.type === 'image_url' &&
    isRecord(value.image_url) &&
    typeof value.image_url.url === 'string' &&
    value.image_url.url.startsWith('data:')
  ) {
    const data = value.image_url.url;
    return {
      ...value,
      image_url: {
        ...value.image_url,
        url: `[image omitted; ${data.length} characters; sha256 ${createHash('sha256').update(data).digest('hex')}]`,
      },
    };
  }
  if (
    value.type === 'image' &&
    isRecord(value.source) &&
    value.source.type === 'base64' &&
    typeof value.source.data === 'string'
  ) {
    const data = value.source.data;
    return {
      ...value,
      source: {
        ...value.source,
        data: `[image omitted; ${data.length} characters; sha256 ${createHash('sha256').update(data).digest('hex')}]`,
      },
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactMediaDebug(item)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const contextLabels: Record<string, string> = {
  snapshot: 'Контекст періоду',
  days: 'Дні',
  entries: 'Записи та чекіни',
  events: 'Події',
  tasks: 'Завдання',
  reminders: 'Нагадування',
  goals: 'Цілі',
  habits: 'Звички',
  actions: 'Відмітки виконання',
  milestones: 'Виконані етапи',
  descriptionItems: 'Пункти опису',
  metrics: 'Метрики',
  checkin: 'Чекін',
  answers: 'Питання та відповіді',
  stages: 'Етапи',
  progress: 'Прогрес',
  previousAnalyses: 'Попередні аналізи',
  coverage: 'Повнота даних',
  followUpDialogMemoryOldestToNewest: 'Пам’ять діалогів від старих до нових',
  nemoryLongTermMemoryFromReflection: 'Висновки з відповіді Неморі',
};

function readableValue(value: unknown, depth = 3): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const heading = (label: string) =>
    depth <= 6 ? `${'#'.repeat(depth)} ${label}` : `**${label}**`;
  return Object.entries(value)
    .map(([key, item]: [string, unknown]) => {
      const label = contextLabels[key] ? `${contextLabels[key]} (${key})` : key;
      if (Array.isArray(item)) {
        if (
          !item.length ||
          item.every((child) => child === null || typeof child !== 'object')
        )
          return `- **${label}:** ${JSON.stringify(item)}`;
        return [
          heading(`${label} — ${item.length}`),
          ...item.map((child, index) => {
            const name = isRecord(child)
              ? (child.title ??
                child.day ??
                child.name ??
                child.question ??
                child.id)
              : undefined;
            const title = `${index + 1}${typeof name === 'string' || typeof name === 'number' ? ` — ${String(name).replace(/\s+/g, ' ')}` : ''}`;
            return `${heading(title)}\n\n${readableValue(child, depth + 1)}\n\n---`;
          }),
        ].join('\n\n');
      }
      if (isRecord(item))
        return `${heading(label)}\n\n${readableValue(item, depth + 1)}`;
      if (typeof item === 'string' && item.includes('\n')) {
        const fence = '`'.repeat(
          Math.max(
            3,
            ...Array.from(
              item.matchAll(/`+/g),
              (match: RegExpMatchArray) => match[0].length + 1,
            ),
          ),
        );
        return `- **${label}:**\n\n${fence}text\n${item}\n${fence}`;
      }
      return `- **${label}:** ${JSON.stringify(item)}`;
    })
    .join('\n\n');
}

function readableText(text: string): string {
  // Unpack the source JSON only in the reading copy, never in the request.
  return text.replace(/^\{[^\n]+\}$/gm, (line) => {
    try {
      return readableValue(JSON.parse(line));
    } catch {
      return line;
    }
  });
}

/** Human-readable rendering; the adjacent JSON is the exact provider payload. */
export function formatAiRequestDebug({
  mode,
  payload,
  stablePrefix,
}: DebugRequest): string {
  const value = payload as Record<string, unknown>;
  const { system } = value;
  const messages = value.messages ?? value.input;
  const parts = [
    `# AI request — ${mode}`,
    'Вхідні повідомлення до моделі в порядку надсилання. JSON-контекст розгорнуто для читання; точний payload, параметри та маркери кешу — у сусідньому .json.',
  ];
  function content(value: unknown) {
    if (typeof value === 'string') {
      if (stablePrefix && value.startsWith(stablePrefix)) {
        parts.push(
          '### Спільний префікс',
          readableText(stablePrefix),
          '----- КІНЕЦЬ СПІЛЬНОГО ПРЕФІКСА -----',
        );
        if (value.length > stablePrefix.length)
          parts.push(
            '### Інструкції після спільного префікса',
            readableText(value.slice(stablePrefix.length)),
          );
      } else parts.push(readableText(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((block: unknown, index) => {
        parts.push(`### Блок ${index + 1}`);
        if (isRecord(block) && typeof block.text === 'string') {
          content(block.text);
        } else parts.push(JSON.stringify(block, null, 2));
      });
    } else parts.push(JSON.stringify(value, null, 2) ?? '');
  }
  if (system !== undefined) {
    parts.push('## SYSTEM (окреме поле провайдера)');
    content(system);
  }
  if (Array.isArray(messages))
    messages.forEach((message: unknown, index) => {
      if (!isRecord(message)) {
        parts.push(JSON.stringify(message));
        return;
      }
      parts.push(
        `## Повідомлення ${index + 1} — ${String(message.role).toUpperCase()}`,
      );
      content(message.content);
    });
  return parts.join('\n\n') + '\n';
}

/** Development-only exact provider evidence. Never log SDK credentials. */
export function writeAiRequestDebug(request: DebugRequest): string | undefined {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const raw = JSON.stringify(redactMediaDebug(request.payload), null, 2);
    const snapshot = {
      ...request,
      payload: JSON.parse(raw) as Record<string, unknown>,
    };
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${request.mode.replace(/[^a-z_]/gi, '_')}-${randomUUID().slice(0, 8)}`;
    const settings = request.payload as Record<string, unknown>;
    if (typeof settings.prompt_cache_key === 'string') {
      const now = Date.now();
      const current = summarizeAiCacheRequest(request.payload);
      const previous = cacheComparisons.get(settings.prompt_cache_key);
      writeContextAudit('provider.cache.request_comparison', {
        debugRequestId: name,
        previousDebugRequestId: previous?.requestId ?? null,
        millisecondsSincePrevious: previous ? now - previous.at : null,
        comparison: previous
          ? compareAiCacheRequests(previous.snapshot, current)
          : null,
        current,
      });
      cacheComparisons.delete(settings.prompt_cache_key);
      cacheComparisons.set(settings.prompt_cache_key, {
        requestId: name,
        at: now,
        snapshot: current,
      });
      if (cacheComparisons.size > 32) {
        const oldestKey: unknown = cacheComparisons.keys().next().value;
        if (typeof oldestKey === 'string') cacheComparisons.delete(oldestKey);
      }
    }
    scheduleServerDebugTask(() => {
      const directory = resolve(process.cwd(), '.tmp', 'ai-requests');
      const path = resolve(directory, name);
      void mkdir(directory, { recursive: true })
        .then(() =>
          Promise.all([
            writeFile(`${path}.json`, raw + '\n', 'utf8'),
            writeFile(`${path}.md`, formatAiRequestDebug(snapshot), 'utf8'),
          ]),
        )
        .catch(() => {
          /* Diagnostics never block an AI response. */
        });
    }, 0);
    return name;
  } catch {
    // Preserve the live request if diagnostic serialization fails.
  }
}
