import { BadRequestException } from '@nestjs/common';
import type { PeriodicAnalysisDto } from './periodic-analysis.dto';

/** Accept only dated day capsules; never forward a raw weekly snapshot by accident. */
export function weeklyCapsuleSnapshot(
  dto: PeriodicAnalysisDto,
  allowEmpty = false,
) {
  const { capsules, missing } = periodCapsuleSnapshot(dto, 'day', allowEmpty);
  return {
    version: 3,
    source: 'daily_capsules',
    dailyCapsules: capsules,
    missingDays: missing,
  };
}

export function yearlyCapsuleSnapshot(
  dto: PeriodicAnalysisDto,
  allowEmpty = false,
) {
  const { capsules, missing } = periodCapsuleSnapshot(dto, 'month', allowEmpty);
  return {
    version: 3,
    source: 'monthly_capsules',
    monthlyCapsules: capsules,
    missingMonths: missing,
  };
}

function periodCapsuleSnapshot(
  dto: PeriodicAnalysisDto,
  childKind: 'day' | 'month',
  allowEmpty = false,
) {
  const monthly = childKind === 'month';
  const rows = monthly
    ? dto.snapshot.monthlyCapsules
    : dto.snapshot.dailyCapsules;
  const requiredCode = monthly
    ? 'ANALYSIS_MONTHLY_CAPSULES_REQUIRED'
    : 'ANALYSIS_DAILY_CAPSULES_REQUIRED';
  if (!Array.isArray(rows) || rows.length > (monthly ? 12 : 7))
    throw new BadRequestException(requiredCode);
  const seen = new Set<string>();
  const dailyCapsules = rows
    .map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new BadRequestException('Invalid daily capsule');
      const row = value as Record<string, unknown>;
      if (
        row.kind !== childKind ||
        typeof row.start !== 'string' ||
        typeof row.end !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.end) ||
        !Number.isFinite(Date.parse(`${row.start}T00:00:00Z`)) ||
        !Number.isFinite(Date.parse(`${row.end}T00:00:00Z`)) ||
        new Date(`${row.start}T00:00:00Z`).toISOString().slice(0, 10) !==
          row.start ||
        new Date(`${row.end}T00:00:00Z`).toISOString().slice(0, 10) !==
          row.end ||
        (!monthly && row.start !== row.end) ||
        (monthly &&
          (!row.start.endsWith('-01') ||
            row.start.slice(0, 7) !== row.end.slice(0, 7) ||
            new Date(
              Date.parse(`${row.end}T00:00:00Z`) + 86400000,
            ).getUTCDate() !== 1)) ||
        row.start < dto.start ||
        row.end > dto.end ||
        row.timezone !== dto.timezone ||
        typeof row.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(row.createdAt)) ||
        Date.parse(row.createdAt) > Date.parse(dto.asOf) ||
        typeof row.asOf !== 'string' ||
        !Number.isFinite(Date.parse(row.asOf)) ||
        Date.parse(row.asOf) > Date.parse(dto.asOf) ||
        typeof row.capsule !== 'string' ||
        !row.capsule.trim() ||
        seen.has(row.start)
      )
        throw new BadRequestException('Invalid or duplicate daily capsule');
      seen.add(row.start);
      return {
        kind: childKind,
        start: row.start,
        end: row.end,
        timezone: row.timezone,
        asOf: row.asOf,
        capsule: row.capsule,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!allowEmpty && !dailyCapsules.length)
    throw new BadRequestException(requiredCode);
  const missingDays: string[] = [];
  for (
    let date = new Date(`${dto.start}T00:00:00Z`);
    date.toISOString().slice(0, 10) <= dto.end;
    monthly
      ? date.setUTCMonth(date.getUTCMonth() + 1)
      : date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    if (!seen.has(day)) missingDays.push(monthly ? day.slice(0, 7) : day);
  }
  return { capsules: dailyCapsules, missing: missingDays };
}
