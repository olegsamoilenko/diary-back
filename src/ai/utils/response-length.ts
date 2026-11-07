import { BasePlanIds } from 'src/plans/types';

/** User-approved visible-answer guides; exclude reasoning and auxiliary capsules. */
const RESPONSE_LENGTHS = {
  entry: [700, 900, 1300],
  checkin: [700, 900, 1300],
  dialog: [600, 800, 1200],
  checkin_dialog: [600, 800, 1200],
  conversation: [600, 800, 1200],
  day: [900, 1200, 1800],
  week: [1200, 1800, 2600],
  month: [1600, 2400, 3400],
  year: [2200, 3200, 4500],
} as const;

export function responseVisibleTokens(
  plan: string | null | undefined,
  kind: keyof typeof RESPONSE_LENGTHS,
): number {
  const tier =
    plan === BasePlanIds.PRO_M1 ? 2 : plan === BasePlanIds.BASE_M1 ? 1 : 0;
  return RESPONSE_LENGTHS[kind][tier];
}

export function responseLengthInstruction(tokens: number): string {
  return `VISIBLE ANSWER LENGTH\n≤~${tokens} visible tokens (not reasoning/capsules), no minimum. Fit complexity/preference; finish explanations/conclusions, omit repetition; simple replies shorter.`;
}
