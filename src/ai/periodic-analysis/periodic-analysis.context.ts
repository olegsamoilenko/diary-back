import { findPartialJsonStringProperty } from '../utils/structured-reflection-progress';
import { PERIODIC_ANALYSIS_PERIODS } from './periodic-analysis.prompt';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PeriodicAnalysisDto } from './periodic-analysis.dto';
import { sourceLocalTime } from '../utils/capsule-content-blocks';

/** Prompt-only copy: persisted timestamps and source hashes remain unchanged. */
export function localizeAnalysisInstants(
  value: unknown,
  timezone: string,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => localizeAnalysisInstants(item, timezone));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const zone = typeof record.timezone === 'string' ? record.timezone : timezone;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      const isInstant =
        (typeof item === 'number' && Number.isFinite(item)) ||
        (typeof item === 'string' &&
          /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item));
      return [
        key,
        /^(createdAt|completedAt|updatedAt|startAt|endAt|at|date)$/.test(key) &&
        isInstant
          ? sourceLocalTime(item, zone)
          : localizeAnalysisInstants(item, zone),
      ];
    }),
  );
}

export function analysisLocalTime(asOf: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(asOf));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
}

export function validateAnalysisPeriod(
  dto: PeriodicAnalysisDto,
  now = Date.now(),
  allowYearEndCapsule = false,
) {
  const start = new Date(dto.start + 'T00:00:00Z');
  const end = new Date(dto.end + 'T00:00:00Z');
  const days = (end.getTime() - start.getTime()) / 86400000 + 1;
  if (
    !Number.isFinite(days) ||
    start.toISOString().slice(0, 10) !== dto.start ||
    end.toISOString().slice(0, 10) !== dto.end ||
    days < 1 ||
    days > (dto.kind === 'year' ? 366 : 31)
  )
    throw new BadRequestException('Invalid analysis period');
  if (dto.kind === 'day' && days !== 1)
    throw new BadRequestException('Invalid day');
  if (
    dto.kind === 'week' &&
    (days !== 7 || start.getUTCDay() !== dto.firstDayOfWeek)
  )
    throw new BadRequestException('Invalid week');
  if (
    dto.kind === 'month' &&
    (start.getUTCDate() !== 1 ||
      dto.start.slice(0, 7) !== dto.end.slice(0, 7) ||
      new Date(end.getTime() + 86400000).getUTCDate() !== 1)
  )
    throw new BadRequestException('Invalid month');
  if (
    dto.kind === 'year' &&
    (dto.start !== `${start.getUTCFullYear()}-01-01` ||
      dto.end !== `${start.getUTCFullYear()}-12-31`)
  )
    throw new BadRequestException('Invalid year');
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: dto.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (key: string) => parts.find((p) => p.type === key)?.value;
    today = `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    throw new BadRequestException('Invalid timezone');
  }
  const asOfMs = Date.parse(dto.asOf);
  if (!Number.isFinite(asOfMs) || asOfMs > now + 60000)
    throw new BadRequestException('Future analysis is unavailable');
  const asOfDay = analysisLocalTime(dto.asOf, dto.timezone).slice(0, 10);
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const earlyYearEnd =
    (dto.kind === 'year' || allowYearEndCapsule) &&
    today.slice(5) >= '12-29' &&
    asOfDay >= `${today.slice(0, 4)}-12-29` &&
    dto.start <= asOfDay &&
    (dto.kind === 'year' ? dto.end === yearEnd : dto.end <= yearEnd);
  if (dto.end > today && !earlyYearEnd)
    throw new BadRequestException('Future analysis is unavailable');
}

export function analysisSourceHash(dto: PeriodicAnalysisDto, model: string) {
  // asOf and request ID are metadata, not new source content.
  return createHash('sha256')
    .update(
      JSON.stringify([
        1,
        dto.kind,
        dto.start,
        dto.end,
        dto.timezone,
        model,
        dto.snapshot,
        dto.note ?? '',
      ]),
    )
    .digest('hex');
}

export type HistoryCapsule = {
  start: string;
  end: string;
  kind: string;
  capsule: string;
};
export function selectAnalysisHistory<T extends { start: string; end: string }>(
  rows: T[],
  before: string,
  limit = 10,
): T[] {
  const selected: T[] = [];
  for (const row of rows) {
    if (
      row.end >= before ||
      selected.some((other) => row.start <= other.end && row.end >= other.start)
    )
      continue;
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function parseAnalysisResult(
  raw: string,
  kind: string,
  separateCapsule = false,
  incomplete = false,
): { text: string; capsule: string } {
  if (incomplete) {
    // Reuse the streaming decoder: preserve only the received text property,
    // not broken JSON, invented endings, or a partial auxiliary capsule.
    const text = findPartialJsonStringProperty(raw, 'text')?.trim();
    if (!text) throw new Error('Empty incomplete analysis');
    return { text, capsule: '' };
  }
  const value = JSON.parse(
    raw.replace(/^```(?:json)?\s*|\s*```$/g, ''),
  ) as Record<string, unknown>;
  if (separateCapsule) value.capsule = 'prepared separately';
  const capsuleLimit =
    PERIODIC_ANALYSIS_PERIODS[
      kind === 'day' || kind === 'week' || kind === 'year' ? kind : 'month'
    ].capsuleLimit;
  if (
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    typeof value.capsule !== 'string' ||
    !value.capsule.trim() ||
    value.capsule.length > capsuleLimit + 300
  )
    throw new Error('Invalid analysis response');
  return {
    text: value.text.trim(),
    capsule: separateCapsule ? '' : value.capsule.trim(),
  };
}
