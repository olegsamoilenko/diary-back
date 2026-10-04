import { describe, expect, it } from '@jest/globals';
import { BasePlanIds } from 'src/plans/types';
import { responseVisibleTokens } from './response-length';
import {
  getResponseOutputTokenLimit,
  estimateResponseOutputTokens,
  qwenThinkingBudget,
  getQwenReasoningOptions,
} from './response-reasoning';
import { buildJournalTask } from './journal-response-instructions';
import { parseAnalysisResult } from '../periodic-analysis/periodic-analysis.context';
import { periodicAnalysisBudgets } from '../periodic-analysis/periodic-analysis.budgets';
import { dialogHistoryThreshold } from '../dialog-context/dialog-context.service';

describe('approved visible-response budgets', () => {
  it('uses all Lite summary/capsule and dialogue compression budgets without a plan', () => {
    expect(periodicAnalysisBudgets(null)).toEqual(
      periodicAnalysisBudgets(BasePlanIds.LITE_M1),
    );
    expect(dialogHistoryThreshold(null)).toBe(12000);
    expect(dialogHistoryThreshold(null)).toBe(
      dialogHistoryThreshold(BasePlanIds.LITE_M1),
    );
  });
  it.each([
    [BasePlanIds.LITE_M1, 768],
    [BasePlanIds.BASE_M1, 1024],
    [BasePlanIds.PRO_M1, 1536],
    [null, 768],
    ['unknown', 768],
  ])(
    'keeps Qwen estimate and provider reasoning aligned for %s',
    (plan, expected) => {
      const budget = qwenThinkingBudget(plan);
      expect(budget).toBe(expected);
      expect(getQwenReasoningOptions(budget).thinking_budget).toBe(expected);
      expect(
        estimateResponseOutputTokens(
          'qwen3.8-max',
          900,
          'tier_response',
          budget,
        ),
      ).toBe(900 + Number(expected) + 256);
      expect(
        getResponseOutputTokenLimit(
          'qwen3.8-max',
          900,
          'tier_response',
          budget,
        ),
      ).toBeUndefined();
    },
  );
  it.each(['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.2', 'qwen3.8-max'])(
    '%s has no tariff-derived API output cutoff',
    (model) => {
      for (const visible of [500, 800, 1200, 1800, 4500]) {
        expect(
          getResponseOutputTokenLimit(model, visible, 'tier_response'),
        ).toBeUndefined();
        expect(
          estimateResponseOutputTokens(model, visible, 'tier_response'),
        ).toBeGreaterThan(visible);
      }
    },
  );
  it.each(['claude-sonnet-5', 'claude-sonnet-5-5', 'claude-opus-5'])(
    '%s uses its required provider maximum independently of the tier',
    (model) => {
      for (const visible of [500, 800, 1200, 1800, 4500]) {
        expect(
          getResponseOutputTokenLimit(model, visible, 'tier_response'),
        ).toBe(128_000);
        expect(
          estimateResponseOutputTokens(model, visible, 'tier_response'),
        ).toBeLessThan(128_000);
      }
    },
  );
  it('accepts a complete annual answer exceeding the obsolete 16000-character guard', () => {
    const text = 'A complete annual explanation. '.repeat(600);
    expect(text.length).toBeGreaterThan(16000);
    expect(
      parseAnalysisResult(JSON.stringify({ text }), 'year', true).text,
    ).toBe(text.trim());
  });
  it.each([
    ['entry', [700, 900, 1300]],
    ['checkin', [700, 900, 1300]],
    ['dialog', [600, 800, 1200]],
    ['checkin_dialog', [600, 800, 1200]],
    ['conversation', [600, 800, 1200]],
    ['day', [900, 1200, 1800]],
    ['week', [1200, 1800, 2600]],
    ['month', [1600, 2400, 3400]],
    ['year', [2200, 3200, 4500]],
  ] as Array<[Parameters<typeof responseVisibleTokens>[1], number[]]>)(
    '%s uses approved Lite/Base/Pro values and Lite for credit-only access',
    (kind, values) => {
      expect(
        [BasePlanIds.LITE_M1, BasePlanIds.BASE_M1, BasePlanIds.PRO_M1].map(
          (plan) => responseVisibleTokens(plan, kind),
        ),
      ).toEqual(values);
      expect(responseVisibleTokens(null, kind)).toBe(values[0]);
    },
  );
  it.each(['entry', 'checkin', 'dialog', 'checkin_dialog'] as const)(
    '%s contains no conflicting old answer character ceiling',
    (mode) => {
      const task = buildJournalTask({
        mode,
        generateShortReflection: true,
        isFirstEntry: false,
        visibleResponseTokens: 1300,
      });
      expect(task).toContain('approximately 1300 tokens');
      expect(task).not.toMatch(/maximum (1500|2000|2500) characters/);
      expect(task).toContain('not a minimum');
    },
  );
  it.each([
    ['gpt-5.6-terra', 8852],
    ['gpt-5.6-luna', 8852],
    ['gpt-5.2', 8852],
    ['claude-sonnet-5', 8852],
    ['claude-sonnet-5-5', 8852],
    ['qwen3.8-max', 5780],
    ['claude-opus-5', 4756],
  ])(
    'keeps 4500 visible tokens separate from the %s cost estimate',
    (model, total) => {
      expect(estimateResponseOutputTokens(model, 4500, 'tier_response')).toBe(
        total,
      );
    },
  );
  it('does not reinterpret existing capsule total budgets or legacy caller allowances', () => {
    expect(
      getResponseOutputTokenLimit('gpt-5.6-luna', 5446, 'period_capsule'),
    ).toBe(5446);
    expect(getResponseOutputTokenLimit('gpt-5.6-terra', 2500)).toBe(2048);
  });
});
