import { describe, expect, it } from '@jest/globals';
import {
  dailyCapsuleMessages,
  dailyCapsuleCompressionMessages,
  dailyCapsuleProseBudget,
  dailyCapsuleReductionPercent,
  withDailySourceObservations,
  capsuleSourceMessages,
  parseDailyCapsule,
} from './daily-capsule';

describe('day capsule source isolation and discussion brief', () => {
  it('removes prior comparison capsules without mutating current-day evidence', () => {
    const data = { snapshot: { days: [{ day: '2026-09-22', entries: ['today'] }] }, previousAnalyses: [{ capsule: 'OLD DAY' }], timezone: 'UTC' };
    const context = [{ role: 'user' as const, content: JSON.stringify(data) }];
    const filtered = capsuleSourceMessages(context, 'day');
    expect(JSON.parse(filtered[0].content)).toEqual({ snapshot: data.snapshot, timezone: 'UTC' });
    expect(JSON.parse(context[0].content)).toEqual(data);
    expect(capsuleSourceMessages(context, 'week')).toEqual(context);
    const initial = dailyCapsuleMessages(context, 'Nemory proposed a hypothesis.');
    expect(initial.map(m => m.content).join('\n')).not.toContain('OLD DAY');
    expect(initial[0].content).toContain('briefMemory');
  });
  it('keeps the brief separate from the period capsule and supports older output', () => {
    expect(parseDailyCapsule('{"capsule":"Day facts","briefMemory":" Hypothesis, advice, unknown result "}', 'stop'))
      .toMatchObject({ capsule: 'Day facts', briefMemory: 'Hypothesis, advice, unknown result' });
    expect(parseDailyCapsule('{"capsule":"Day facts"}', 'stop')).not.toHaveProperty('briefMemory');
  });
});

describe('daily capsule prose budget', () => {
  it.each([
    [1402, 389, 421, 511, 59], // Day12 audit.
    [1171, 299, 511, 601, 42], // Day11 audit.
    [1362, 0, 810, 900, 41], // Compatible no-measurements path.
    [1100, 850, 50, 50, 80], // Evidence fills soft target, still room before hard cap.
  ])(
    'budgets %i total with %i fixed tokens',
    (total, fixed, target, maximum, reduction) => {
      const evidence = {
        text: fixed ? '[SOURCE_OBSERVATIONS]fixed[/SOURCE_OBSERVATIONS]' : '',
        tokens: fixed,
      };
      expect(dailyCapsuleProseBudget(evidence)).toEqual({ target, maximum });
      expect(dailyCapsuleReductionPercent(total, evidence)).toBe(reduction);
      const first = dailyCapsuleMessages([], '', evidence)[0].content;
      const retry = dailyCapsuleCompressionMessages(
        'dated prose',
        total,
        evidence,
      )[0].content;
      for (const prompt of [first, retry]) {
        expect(prompt).toContain(`target ${target} tokens`);
        expect(prompt).toContain(`maximum ${maximum} tokens`);
        expect(prompt).not.toContain('Aim for about 900');
      }
    },
  );

  it('does not ask the model to rewrite measurements or replay the original day', () => {
    const evidence = {
      text: '[SOURCE_OBSERVATIONS]2026-09-12 21:40: Stress1/5[/SOURCE_OBSERVATIONS]',
      tokens: 389,
    };
    const original = withDailySourceObservations(
      '2026-09-12: first trial; result unknown.',
      evidence,
    );
    const messages = dailyCapsuleCompressionMessages(original, 1402, evidence);
    expect(JSON.parse(messages[1].content)).toEqual({
      capsule: '2026-09-12: first trial; result unknown.',
    });
    expect(withDailySourceObservations('Shorter dated prose.', evidence)).toBe(
      `Shorter dated prose.\n${evidence.text}`,
    );
  });

  it('does not manufacture a negative prose budget when fixed evidence fills the cap', () => {
    const evidence = { text: 'fixed observations', tokens: 1050 };
    expect(dailyCapsuleProseBudget(evidence)).toEqual({
      target: 0,
      maximum: 0,
    });
    expect(dailyCapsuleMessages([], '', evidence)[0].content).toContain(
      'retain it with an over-budget status',
    );
  });
});
