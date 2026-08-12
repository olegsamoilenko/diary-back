import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { sendAiErrorsTelegram } from 'src/telegram/send-telegram';

export type AiErrorTransport = 'http' | 'websocket' | 'background';

export type AiErrorReport = {
  operation: string;
  transport: AiErrorTransport;
  error: unknown;
  status?: number | null;
  code?: string | null;
  userId?: number | string | null;
  model?: string | null;
  requestId?: string | null;
  meta?: Record<string, string | number | boolean | null | undefined>;
  test?: boolean;
};

type RecentError = {
  lastSentAt: number;
  suppressed: number;
};

const DUPLICATE_WINDOW_MS = 60_000;
const MAX_RECENT_ERRORS = 500;
const EXPECTED_AI_STATUS_CODES = new Set([
  401, 403, 480, 481, 482, 483, 484, 485, 486, 487, 488, 490, 491,
]);

export function shouldReportAiHttpError(params: {
  path: string;
  status: number;
  userId?: number | string | null;
}): boolean {
  const path = params.path.split('?')[0] || '/';
  if (!/^\/ai(?:\/|$)/.test(path)) return false;
  if (EXPECTED_AI_STATUS_CODES.has(params.status)) return false;
  if (params.status === 404 && !params.userId) return false;

  return params.status >= 500 || Boolean(params.userId);
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack ?? null,
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error, stack: null };
  }

  try {
    return {
      name: 'Error',
      message: JSON.stringify(error) || 'Unknown error',
      stack: null,
    };
  } catch {
    return { name: 'Error', message: 'Unknown error', stack: null };
  }
}

function oneLine(value: unknown, maxLength = 500): string {
  let text = '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    text = String(value);
  } else if (value != null) {
    try {
      text = JSON.stringify(value) || '';
    } catch {
      text = '[unserializable]';
    }
  }

  return text
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

@Injectable()
export class AiErrorReporterService implements OnApplicationBootstrap {
  private readonly recentErrors = new Map<string, RecentError>();

  onApplicationBootstrap() {
    if (process.env.TELEGRAM_AI_ERRORS_TEST_ON_STARTUP !== 'true') return;

    this.report({
      operation: 'startup_configuration_test',
      transport: 'background',
      error: new Error('Test AI error alert. The integration is configured.'),
      test: true,
      meta: { environment: process.env.NODE_ENV ?? 'unknown' },
    });
  }

  shouldReportHttpError(params: {
    path: string;
    status: number;
    userId?: number | string | null;
  }): boolean {
    return shouldReportAiHttpError(params);
  }

  report(report: AiErrorReport): void {
    const details = errorDetails(report.error);
    const fingerprint = [
      report.transport,
      report.operation,
      report.status ?? '',
      report.code ?? '',
      report.test ? 'test' : 'error',
      details.name,
      details.message,
    ].join('|');
    const now = Date.now();
    const recent = this.recentErrors.get(fingerprint);

    if (recent && now - recent.lastSentAt < DUPLICATE_WINDOW_MS) {
      recent.suppressed += 1;
      return;
    }

    const suppressed = recent?.suppressed ?? 0;
    this.recentErrors.set(fingerprint, { lastSentAt: now, suppressed: 0 });
    this.pruneRecentErrors(now);

    const lines = [
      report.test ? '🧪 AI ERROR ALERT TEST' : '🚨 AI SERVER ERROR',
      `Operation: ${oneLine(report.operation, 200)}`,
      `Transport: ${report.transport}`,
      report.status != null ? `Status: ${report.status}` : null,
      report.code ? `Code: ${oneLine(report.code, 120)}` : null,
      report.userId != null ? `User ID: ${report.userId}` : null,
      report.model ? `Model: ${oneLine(report.model, 120)}` : null,
      report.requestId ? `Request ID: ${oneLine(report.requestId, 160)}` : null,
      `Error: ${oneLine(details.name, 120)} — ${oneLine(details.message, 800)}`,
      suppressed > 0 ? `Repeated since previous alert: ${suppressed}` : null,
      `Time: ${new Date(now).toISOString()}`,
    ].filter((line): line is string => Boolean(line));

    const safeMeta = Object.entries(report.meta ?? {})
      .filter(([, value]) => value != null)
      .slice(0, 12)
      .map(([key, value]) => `${oneLine(key, 80)}: ${oneLine(value, 240)}`);
    if (safeMeta.length) lines.push('', 'Context:', ...safeMeta);

    if (details.stack) {
      lines.push('', 'Stack:', details.stack.slice(0, 1800));
    }

    void sendAiErrorsTelegram(lines.join('\n')).catch((sendError) => {
      console.warn('Failed to send AI error Telegram alert:', sendError);
    });
  }

  private pruneRecentErrors(now: number) {
    if (this.recentErrors.size <= MAX_RECENT_ERRORS) return;

    for (const [key, value] of this.recentErrors) {
      if (now - value.lastSentAt >= DUPLICATE_WINDOW_MS) {
        this.recentErrors.delete(key);
      }
      if (this.recentErrors.size <= MAX_RECENT_ERRORS) return;
    }

    const oldestKey = this.recentErrors.keys().next().value as
      | string
      | undefined;
    if (oldestKey) this.recentErrors.delete(oldestKey);
  }
}
