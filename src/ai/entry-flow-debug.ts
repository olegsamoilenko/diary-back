import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  rememberMemoryReviewStep,
  type MemoryReviewSection,
} from './memory-review-file-log';

type EntryFlowDirection = 'APP -> SERVER' | 'SERVER -> APP';

type EntryFlowDebugParams = {
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  direction: EntryFlowDirection;
  traceId?: string;
  userId?: number;
  durationMs?: number;
  data: unknown;
  rawSections?: Array<{ title: string; content: string }>;
};

type ServerMemoryReviewUsage = {
  tokens: number;
  credits: number;
};

type ServerMemoryReviewSection = MemoryReviewSection & {
  usage?: ServerMemoryReviewUsage;
};

const MARKER = 'NEMORY_SERVER_ENTRY_FLOW';
const FULL_DEBUG_FILE_PREFIX = 'nemory-ai-full';
let fullDebugWriteQueue: Promise<void> = Promise.resolve();

function getFullDebugFilePath(createdAt: string, format: 'jsonl' | 'pretty') {
  const day = createdAt.slice(0, 10);
  return resolve(
    process.cwd(),
    '.tmp',
    format === 'jsonl'
      ? `${FULL_DEBUG_FILE_PREFIX}-${day}.jsonl`
      : `${FULL_DEBUG_FILE_PREFIX}-${day}.pretty.log`,
  );
}

export function scheduleServerDebugTask(task: () => void, delayMs = 1_000) {
  const timer = setTimeout(() => {
    try {
      task();
    } catch (error) {
      console.warn(
        `NEMORY_DEBUG_BACKGROUND_ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, delayMs);
  timer.unref?.();
}

export function writeFullServerDebugLog(marker: string, payload: unknown) {
  if (process.env.NODE_ENV === 'production') return;

  scheduleServerDebugTask(() => {
    const createdAt = new Date().toISOString();
    let envelope: unknown;
    try {
      // Serialize here once so both file representations contain the exact
      // same payload. The JSONL file is optimized for tools; the pretty log is
      // optimized for opening and reading directly in an editor.
      const serialized = JSON.stringify({ marker, createdAt, payload });
      envelope = JSON.parse(serialized);
    } catch (error) {
      envelope = {
        marker,
        createdAt,
        serializationError:
          error instanceof Error ? error.message : String(error),
      };
    }
    const line = `${JSON.stringify(envelope)}\n`;
    const prettyBlock = `${JSON.stringify(envelope, null, 2)}\n\n`;

    fullDebugWriteQueue = fullDebugWriteQueue
      .then(async () => {
        const directory = resolve(process.cwd(), '.tmp');
        await mkdir(directory, { recursive: true });
        await Promise.all([
          appendFile(getFullDebugFilePath(createdAt, 'jsonl'), line, 'utf8'),
          appendFile(
            getFullDebugFilePath(createdAt, 'pretty'),
            prettyBlock,
            'utf8',
          ),
        ]);
      })
      .catch((error) => {
        console.warn(
          `NEMORY_DEBUG_FILE_WRITE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  });
}

export function logServerEntryFlow(params: EntryFlowDebugParams) {
  if (process.env.NODE_ENV === 'production') return;

  scheduleServerDebugTask(() => {
    console.log(
      JSON.stringify({
        marker: `${MARKER}_STATS`,
        stage: params.stage,
        title: params.title,
        direction: params.direction,
        traceId: params.traceId ?? null,
        userId: params.userId ?? null,
        durationMs: params.durationMs ?? null,
        rawSectionsCount: params.rawSections?.length ?? 0,
      }),
    );
  });
  writeFullServerDebugLog(MARKER, params);
}

export function logServerMemoryReview(params: {
  step: 1 | 2 | 3 | 4;
  title: string;
  sourceType:
    | 'entry'
    | 'checkin'
    | 'dialog'
    | 'checkin_dialog'
    | 'consolidation';
  traceId?: string;
  userId?: number;
  durationMs?: number;
  sections: ServerMemoryReviewSection[];
}) {
  if (process.env.NODE_ENV === 'production') return;

  const sourceLabels = {
    entry: 'ЗАПИС',
    checkin: 'ЧЕКІН',
    dialog: 'ДІАЛОГ ЗАПИСУ',
    checkin_dialog: 'ДІАЛОГ ЧЕКІНУ',
    consolidation: 'BACKGROUND USER MEMORY CONSOLIDATION',
  } as const;

  scheduleServerDebugTask(() => {
    console.log(
      JSON.stringify({
        marker: 'NEMORY_SERVER_REVIEW_STATS',
        source: sourceLabels[params.sourceType],
        step: params.step,
        title: params.title,
        traceId: params.traceId ?? null,
        userId: params.userId ?? null,
        durationMs: params.durationMs ?? null,
        sections: params.sections.map((section) => ({
          label: section.label,
          count: section.count ?? null,
          tokens: section.usage?.tokens ?? null,
          credits: section.usage?.credits ?? null,
        })),
      }),
    );
  });
  rememberMemoryReviewStep(params);
}

export function logServerEntryTiming(params: {
  traceId?: string;
  event: string;
  elapsedMs: number;
  data?: unknown;
}) {
  if (process.env.NODE_ENV === 'production') return;

  scheduleServerDebugTask(() => {
    console.log(
      JSON.stringify({
        marker: 'NEMORY_SERVER_ENTRY_TIMING',
        event: params.event,
        traceId: params.traceId ?? null,
        elapsedMs: params.elapsedMs,
      }),
    );
  });
  writeFullServerDebugLog('NEMORY_SERVER_ENTRY_TIMING', params);
}
