import { Logger } from '@nestjs/common';
import { scheduleServerDebugTask } from './entry-flow-debug';

export type BackendAiTimingContext = {
  traceId: string;
  flow: string;
  startedAtMs: number;
  lastMarkedAtMs?: number;
  marks: Array<Record<string, unknown>>;
};

export function markBackendAiTiming(
  logger: Logger,
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

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEMORY_AI_TIMING_DEBUG === '1'
  ) {
    scheduleServerDebugTask(() => {
      logger.log(
        JSON.stringify({
          marker: 'NEMORY_SAVE_TO_AI_TRACE',
          side: 'backend',
          traceId: context.traceId,
          flow: context.flow,
          ...mark,
        }),
      );
    });
  }
}
