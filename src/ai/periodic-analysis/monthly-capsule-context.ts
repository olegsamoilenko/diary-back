import { BadRequestException } from '@nestjs/common';
import type { PeriodicAnalysisDto } from './periodic-analysis.dto';
import { weeklyCapsuleSnapshot } from './weekly-capsule-context';

function invalid(): never {
  throw new BadRequestException('INVALID_MONTH_CAPSULE_CONTEXT');
}
function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let at = Date.parse(start); at <= Date.parse(end); at += 86400000)
    days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/** Capsule-only input for one observed portion of a calendar week within the month. */
export function monthFragmentSource(dto: PeriodicAnalysisDto) {
  const rows = dto.snapshot.dailyCapsules;
  if (!Array.isArray(rows) || !rows.length || rows.length > 7) invalid();
  const dates = rows.map((row: Record<string, unknown>) => row?.start);
  if (!dates.every(validDate)) invalid();
  dates.sort();
  const start = dates[0],
    end = dates[dates.length - 1];
  if (
    start < dto.start ||
    end > dto.end ||
    daysBetween(start, end).length !== rows.length
  )
    invalid();
  if (
    daysBetween(start, end)
      .slice(1)
      .some((day) => new Date(day).getUTCDay() === dto.firstDayOfWeek)
  )
    invalid();
  const snapshot = weeklyCapsuleSnapshot({ ...dto, start, end });
  return {
    kind: 'month_fragment',
    scope:
      'Partial week: only these dated sources, never a complete week. Missing days are unknown.',
    start,
    end,
    timezone: dto.timezone,
    asOf: dto.asOf,
    snapshot,
  };
}

/** V4 monthly input: non-overlapping weeks plus compressed uncovered days. Legacy input stays compatible. */
export function monthlyCapsuleSnapshot(
  dto: PeriodicAnalysisDto,
  allowUncompressed = false,
) {
  if (dto.snapshot.source !== 'weekly_capsules_and_day_fragments') return null;
  const weeks = dto.snapshot.weeklyCapsules;
  const fragments = dto.snapshot.dayFragments;
  if (
    !Array.isArray(weeks) ||
    weeks.length > 6 ||
    !Array.isArray(fragments) ||
    fragments.length > 31
  )
    invalid();
  const covered = new Set<string>();
  const mark = (days: string[]) => {
    for (const day of days) {
      if (covered.has(day)) invalid();
      covered.add(day);
    }
  };
  const weeklyCapsules = weeks.map((row: Record<string, unknown>) => {
    if (
      !row ||
      row.kind !== 'week' ||
      !validDate(row.start) ||
      !validDate(row.end) ||
      Date.parse(row.end) - Date.parse(row.start) !== 6 * 86400000 ||
      new Date(row.start).getUTCDay() !== dto.firstDayOfWeek ||
      row.end < dto.start ||
      row.end > dto.end ||
      row.timezone !== dto.timezone ||
      typeof row.capsule !== 'string' ||
      !row.capsule.trim() ||
      typeof row.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      Date.parse(row.createdAt) > Date.parse(dto.asOf) ||
      typeof row.asOf !== 'string' ||
      !Number.isFinite(Date.parse(row.asOf)) ||
      Date.parse(row.asOf) > Date.parse(dto.asOf)
    )
      invalid();
    mark(daysBetween(row.start, row.end).filter((day) => day >= dto.start));
    return {
      kind: 'week',
      start: row.start,
      end: row.end,
      capsule: row.capsule,
    };
  });
  const dayFragments = fragments.map((row: Record<string, unknown>) => {
    if (
      !row ||
      !validDate(row.start) ||
      !validDate(row.end) ||
      row.start < dto.start ||
      row.end > dto.end ||
      row.end < row.start
    )
      invalid();
    const days = daysBetween(row.start, row.end);
    if (
      days.length > 7 ||
      days
        .slice(1)
        .some((day) => new Date(day).getUTCDay() === dto.firstDayOfWeek) ||
      JSON.stringify(row.days) !== JSON.stringify(days)
    )
      invalid();
    mark(days);
    if (typeof row.capsule === 'string' && row.capsule.trim())
      return {
        kind: 'month_fragment',
        start: row.start,
        end: row.end,
        days,
        capsule: row.capsule,
      };
    if (!allowUncompressed)
      throw new BadRequestException('MONTH_FRAGMENT_COMPRESSION_REQUIRED');
    const source = monthFragmentSource({
      ...dto,
      snapshot: { dailyCapsules: row.dailyCapsules },
    });
    if (source.start !== row.start || source.end !== row.end) invalid();
    return { ...source, days };
  });
  if (!covered.size) throw new BadRequestException('ANALYSIS_NO_DATA');
  return {
    version: 4,
    source: 'weekly_capsules_and_day_fragments',
    weeklyCapsules,
    dayFragments,
    missingDays: daysBetween(dto.start, dto.end).filter(
      (day) => !covered.has(day),
    ),
    scope:
      'Opening week may include the previous month as background only. Attribute events to their dates. Fragments cover only their stated days; never count them as full weeks.',
  };
}
