import { BasePlanIds } from 'src/plans/types';

/** Shared policy for the models currently offered by Nemory. */
const QWEN_THINKING_BUDGET_TOKENS = 1024;
export function qwenThinkingBudget(plan: string | null | undefined): number {
  if (plan === BasePlanIds.PRO_M1) return 1536;
  if (plan === BasePlanIds.BASE_M1) return 1024;
  // Credit-only and other fallback access use Lite, like visible-answer guides.
  return 768;
}
const RESPONSE_OUTPUT_CEILING_TOKENS = 2048;
export type ResponseOutputPurpose =
  | 'response'
  | 'period_capsule'
  | 'tier_response';

export function getOpenAiReasoningOptions(modelId: string): {
  reasoning_effort?: 'medium';
} {
  return modelId === 'gpt-5.6-terra' || modelId === 'gpt-5.6-luna'
    ? { reasoning_effort: 'medium' }
    : {};
}

export function getQwenReasoningOptions(budget = QWEN_THINKING_BUDGET_TOKENS) {
  return {
    enable_thinking: true,
    thinking_budget: budget,
  };
}

function isAdaptiveSonnet(modelId: string): boolean {
  return modelId === 'claude-sonnet-5' || modelId === 'claude-sonnet-5-5';
}

export function getClaudeReasoningOptions(modelId: string) {
  if (isAdaptiveSonnet(modelId)) {
    return {
      thinking: { type: 'adaptive' as const },
      output_config: { effort: 'medium' as const },
    };
  }
  // Preserve the explicitly agreed request behavior for released Opus clients.
  return modelId === 'claude-opus-5'
    ? { thinking: { type: 'disabled' as const } }
    : {};
}

/** Cost estimate includes reasoning and answer; it is not a main-response API cap.
 * Technical memory extraction has its own combined limits, outside this policy.
 */
export function estimateResponseOutputTokens(
  modelId: string,
  responseTokenLimit: number,
  purpose: ResponseOutputPurpose = 'response',
  qwenBudget = QWEN_THINKING_BUDGET_TOKENS,
): number {
  if (purpose === 'tier_response') {
    // Preserve the existing affordability estimate independently of provider limits.
    // Reserve is an initial technical allowance, not a promise of sufficient reasoning.
    const reasoning =
      modelId === 'qwen3.8-max'
        ? qwenBudget
        : modelId.startsWith('gpt-5') || isAdaptiveSonnet(modelId)
          ? 4096
          : 0;
    return responseTokenLimit + reasoning + 256;
  }
  // Capsule text has its own measured limit; this budget also pays for reasoning/JSON.
  if (purpose === 'period_capsule' && modelId === 'gpt-5.6-luna')
    return Math.min(responseTokenLimit, 8192);
  if (modelId === 'qwen3.8-max') return responseTokenLimit + qwenBudget;
  const cappedModel =
    isAdaptiveSonnet(modelId) ||
    modelId === 'gpt-5.6-terra' ||
    modelId === 'gpt-5.6-luna';
  return cappedModel
    ? Math.min(responseTokenLimit, RESPONSE_OUTPUT_CEILING_TOKENS)
    : responseTokenLimit;
}

/** User-facing answers follow prompt length guides, never a tariff-derived API cap.
 * Anthropic requires max_tokens: use the published model maximum (128K), not a
 * product limit. https://platform.claude.com/docs/en/models/sonnet-5/overview
 * https://platform.claude.com/docs/en/models/opus-5/overview
 * Technical capsule and legacy extraction budgets remain explicit.
 */
export function getResponseOutputTokenLimit(
  modelId: string,
  responseTokenLimit: number,
  purpose: ResponseOutputPurpose = 'response',
  qwenBudget = QWEN_THINKING_BUDGET_TOKENS,
): number | undefined {
  if (purpose === 'tier_response') {
    return isAdaptiveSonnet(modelId) || modelId === 'claude-opus-5'
      ? 128_000
      : undefined;
  }
  return estimateResponseOutputTokens(
    modelId,
    responseTokenLimit,
    purpose,
    qwenBudget,
  );
}
