import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CONTEXT_AUDIT_EVENT = 'NEMORY_CONTEXT_AUDIT_PART';
type Envelope = {
  id: string;
  source: 'frontend' | 'backend';
  stage: string;
  loggedAt: string;
  payload: unknown;
};
type Parts = { count: number; createdAt: number; values: Map<number, string> };
const pending = new Map<string, Parts>();
const completed = new Map<string, number>();
let writes: Promise<void> = Promise.resolve();

export function contextFingerprints(payload: unknown) {
  const fingerprints: Record<
    string,
    { characters: number; utf8Bytes: number; sha256: string }
  > = {};
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 6 || !value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const itemPath = path ? `${path}.${key}` : key;
      if (
        /promptJson|memoryContextJson|prompt|sourceMessage|entryContent/i.test(
          key,
        )
      ) {
        const text = typeof item === 'string' ? item : JSON.stringify(item);
        if (text !== undefined)
          fingerprints[itemPath] = {
            characters: text.length,
            utf8Bytes: Buffer.byteLength(text, 'utf8'),
            sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
          };
      }
      visit(item, itemPath, depth + 1);
    }
  };
  visit(payload, '', 0);
  return fingerprints;
}

function readable(value: unknown, path = ''): string {
  if (typeof value === 'string') return `### ${path}\n\n${value}\n`;
  if (!value || typeof value !== 'object')
    return `- ${path}: ${JSON.stringify(value)}\n`;
  return Object.entries(value)
    .map(([key, item]) => readable(item, path ? `${path}.${key}` : key))
    .join('\n');
}

function save(envelope: Envelope): void {
  const record = {
    ...envelope,
    receivedAt: new Date().toISOString(),
    fingerprints: contextFingerprints(envelope.payload),
  };
  const day = record.receivedAt.slice(0, 10);
  const directory =
    envelope.source === 'frontend'
      ? resolve(process.cwd(), '..', 'diary-front', '.tmp')
      : resolve(process.cwd(), '.tmp');
  // A deployed backend must never create a fake sibling project for device logs.
  if (
    envelope.source === 'frontend' &&
    !existsSync(resolve(directory, '..', 'package.json'))
  ) {
    return;
  }
  const basename = resolve(directory, `context-audit-${day}`);
  const raw = JSON.stringify(record) + '\n';
  const markdown = `\n# ${envelope.stage} | ${envelope.id}\n\nObserved: ${envelope.loggedAt}\n\nFingerprints:\n\n${JSON.stringify(record.fingerprints, null, 2)}\n\n${readable(envelope.payload)}\n`;
  writes = writes
    .then(async () => {
      await mkdir(directory, { recursive: true });
      await appendFile(`${basename}.jsonl`, raw, 'utf8');
      await appendFile(`${basename}.md`, markdown, 'utf8');
    })
    .catch(() => {
      // A failed local write must not poison subsequent audit writes.
    });
}

export function writeContextAudit(stage: string, payload: unknown): void {
  if (process.env.NODE_ENV !== 'development') return;
  try {
    save(
      JSON.parse(
        JSON.stringify({
          id: randomUUID(),
          source: 'backend',
          stage,
          loggedAt: new Date().toISOString(),
          payload,
        }),
      ) as Envelope,
    );
  } catch {
    // Auditing must not change the request outcome.
  }
}

/** Reuse /logs; full context diagnostics are local files, never general log DB rows. */
export function acceptContextAuditPart(value: unknown): void {
  if (process.env.NODE_ENV !== 'development') return;
  const part = value as {
    id?: string;
    index?: number;
    count?: number;
    text?: string;
  } | null;
  if (
    !part ||
    typeof part.id !== 'string' ||
    !/^[a-z0-9-]{1,100}$/i.test(part.id) ||
    !Number.isInteger(part.index) ||
    !Number.isInteger(part.count) ||
    part.count! < 1 ||
    part.count! > 8192 ||
    part.index! < 0 ||
    part.index! >= part.count! ||
    typeof part.text !== 'string' ||
    part.text.length > 400
  )
    return;
  const now = Date.now();
  for (const [id, item] of pending)
    if (now - item.createdAt > 600000) {
      pending.delete(id);
    }
  for (const [id, at] of completed) if (now - at > 600000) completed.delete(id);
  if (completed.has(part.id)) return;
  if (!pending.has(part.id) && pending.size >= 64) {
    return;
  }
  const entry = pending.get(part.id) ?? {
    count: part.count!,
    createdAt: now,
    values: new Map<number, string>(),
  };
  if (entry.count !== part.count) return;
  entry.values.set(part.index!, part.text);
  pending.set(part.id, entry);
  if (entry.values.size !== entry.count) return;
  pending.delete(part.id);
  try {
    const raw = Array.from({ length: entry.count }, (_, i) =>
      entry.values.get(i),
    ).join('');
    const envelope = JSON.parse(raw) as Envelope;
    if (
      envelope.id !== part.id ||
      envelope.source !== 'frontend' ||
      typeof envelope.stage !== 'string'
    )
      return;
    completed.set(part.id, now);
    save(envelope);
  } catch {
    // Ignore malformed diagnostic payloads without failing /logs ingestion.
  }
}

export function flushContextAudit(): Promise<void> {
  return writes;
}
