import {
  monthlyCapsuleSnapshot,
  monthFragmentSource,
} from './monthly-capsule-context';
import { it, expect } from '@jest/globals';
import type { PeriodicAnalysisDto } from './periodic-analysis.dto';
const capsule = (kind: string, start: string, end = start) => ({
  kind,
  start,
  end,
  timezone: 'Europe/Kyiv',
  createdAt: '2026-10-01T00:00:00Z',
  asOf: '2026-10-01T00:00:00Z',
  capsule: `${kind} ${start}`,
});
const request = (): PeriodicAnalysisDto => ({
  expectedUserId: 1,
  requestId: '11111111-1111-4111-8111-111111111111',
  kind: 'month',
  start: '2026-09-01',
  end: '2026-09-30',
  timezone: 'Europe/Kyiv',
  asOf: '2026-10-01T12:00:00Z',
  firstDayOfWeek: 1,
  snapshot: {
    source: 'weekly_capsules_and_day_fragments',
    weeklyCapsules: [capsule('week', '2026-09-21', '2026-09-27')],
    dayFragments: [
      {
        start: '2026-09-28',
        end: '2026-09-30',
        days: ['2026-09-28', '2026-09-29', '2026-09-30'],
        capsule: 'Three days compressed',
      },
    ],
  },
});
it('counts a compressed tail once and derives missing days, ignoring claimed coverage', () => {
  const dto = request();
  dto.snapshot.missingDays = [];
  const result = monthlyCapsuleSnapshot(dto)!;
  expect(result.dayFragments).toHaveLength(1);
  expect(result.missingDays).toHaveLength(20);
  expect(result.missingDays).not.toContain('2026-09-28');
});
it('accepts opening cross-month week but excludes dates before month from coverage', () => {
  const dto = request();
  (dto.snapshot.weeklyCapsules as unknown[]).push(
    capsule('week', '2026-08-31', '2026-09-06'),
  );
  expect(monthlyCapsuleSnapshot(dto)!.missingDays).toHaveLength(14);
});
it.each([
  'overlap',
  'wrongTimezone',
  'futureRevision',
  'futureWeek',
  'falseDays',
  'badDate',
])('rejects %s before paid monthly generation', (kind) => {
  const dto = request();
  const weeks = dto.snapshot.weeklyCapsules as any[];
  const fragments = dto.snapshot.dayFragments as any[];
  if (kind === 'overlap') weeks.push({ ...weeks[0] });
  if (kind === 'wrongTimezone') weeks[0].timezone = 'UTC';
  if (kind === 'futureRevision') weeks[0].asOf = '2027-01-01T00:00:00Z';
  if (kind === 'futureWeek')
    weeks.push(capsule('week', '2026-09-28', '2026-10-04'));
  if (kind === 'falseDays') fragments[0].days = ['2026-09-28'];
  if (kind === 'badDate') fragments[0].start = '2026-09-31';
  expect(() => monthlyCapsuleSnapshot(dto)).toThrow();
});
it('allows raw tail for free estimate only and validates its daily evidence', () => {
  const dto = request();
  const fragment = (dto.snapshot.dayFragments as any[])[0];
  delete fragment.capsule;
  fragment.dailyCapsules = [28, 29, 30].map((n) =>
    capsule('day', `2026-09-${n}`),
  );
  expect(() => monthlyCapsuleSnapshot(dto)).toThrow(
    'MONTH_FRAGMENT_COMPRESSION_REQUIRED',
  );
  expect(monthlyCapsuleSnapshot(dto, true)!.dayFragments).toHaveLength(1);
  expect(
    monthFragmentSource({
      ...dto,
      snapshot: { dailyCapsules: fragment.dailyCapsules },
    }).kind,
  ).toBe('month_fragment');
  fragment.dailyCapsules[1].start = '2026-09-28';
  expect(() => monthlyCapsuleSnapshot(dto, true)).toThrow();
});
it('keeps old client raw snapshots compatible', () =>
  expect(
    monthlyCapsuleSnapshot({ ...request(), snapshot: { days: [] } }),
  ).toBeNull());
