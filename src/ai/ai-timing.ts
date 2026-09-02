import type { Logger } from '@nestjs/common';

export type BackendAiTimingContext = {
  traceId: string;
  flow: string;
  startedAtMs: number;
  lastMarkedAtMs?: number;
  marks: Array<Record<string, unknown>>;
};

export function markBackendAiTiming(
  _logger: Logger,
  context: BackendAiTimingContext | undefined,
  phase: string,
  data: Record<string, unknown> = {},
) {
  if (!context) return;

  const nowMs = Date.now();
  const previousMarkAtMs = context.lastMarkedAtMs ?? context.startedAtMs;
  const mark = {
    phase,
    stepMs: nowMs - previousMarkAtMs,
    elapsedMs: nowMs - context.startedAtMs,
    ...data,
  };
  context.lastMarkedAtMs = nowMs;
  context.marks.push(mark);
}
