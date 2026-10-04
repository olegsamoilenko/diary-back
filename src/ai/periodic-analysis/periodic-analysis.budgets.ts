import { BasePlanIds } from 'src/plans/types';
import { PERIODIC_ANALYSIS_PERIODS } from './periodic-analysis.prompt';

/** Match entry/check-in selection: stop near the ceiling, keeping the last capsule whole. */
export const PERIODIC_HISTORY_STOP_REMAINING_TOKENS = 200;

export type CapsulePolicy = {
  kind: 'day' | 'week' | 'month' | 'year';
  unit?: 'tokens' | 'characters';
  target: number;
  maximum: number;
  /** Paid retry threshold, independent of the prompt's compression goal. */
  retryAboveTokens?: number;
  outputLimit: number;
};

/** User-approved Lite/Base/Pro context budgets, excluding the system prompt. */
export function periodicAnalysisBudgets(basePlanId: string | null) {
  const tier =
    basePlanId === BasePlanIds.PRO_M1
      ? 2
      : basePlanId === BasePlanIds.BASE_M1
        ? 1
        : 0;
  const capsule = (
    kind: CapsulePolicy['kind'],
    maximum: number,
    unit: CapsulePolicy['unit'] = 'tokens',
  ): CapsulePolicy => ({
    unit,
    kind,
    maximum,
    // Leave room for tokenizer variance; do not pad sparse source material.
    target: Math.floor(maximum * 0.9),
    // Always API tokens. For character policies this is a conservative ceiling, not a conversion.
    outputLimit: maximum + 4096,
  });
  return {
    context: {
      day: [7500, 11500, 17000][tier],
      week: [9500, 14500, 21000][tier],
      month: [11500, 17500, 26000][tier],
      year: [13500, 20500, 31000][tier],
    },
    dayCapsule: {
      ...capsule('day', [900, 1200, 1500][tier]),
      retryAboveTokens: [1200, 1600, 2000][tier],
    },
    weekCapsule: capsule('week', [1100, 1350, 1700][tier]),
    monthCapsule: {
      ...capsule('month', PERIODIC_ANALYSIS_PERIODS.month.capsuleLimit),
      retryAboveTokens: 2000,
    },
    // Preserve the existing year character budget until a token budget is approved.
    yearCapsule: capsule(
      'year',
      PERIODIC_ANALYSIS_PERIODS.year.capsuleLimit,
      'characters',
    ),
  };
}
