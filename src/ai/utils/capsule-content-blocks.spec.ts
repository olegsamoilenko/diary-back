import { AiService } from '../ai.service';
import { describe, expect, it, jest } from '@jest/globals';
import { AiModel } from '../../users/types';
import {
  compactSourceMetrics,
  withSourceObservation,
  sourceLocalTime,
  sourceCapsuleInput,
} from './capsule-content-blocks';

describe('source capsule evidence', () => {
  it('computes historical local time, including the seasonal offset', () => {
    expect(sourceLocalTime('2026-09-07T12:10:00Z', 'Europe/Kiev')).toBe(
      '2026-09-07 15:10 Europe/Kiev',
    );
    expect(sourceLocalTime('2026-01-07T12:10:00Z', 'Europe/Kiev')).toBe(
      '2026-01-07 14:10 Europe/Kiev',
    );
    expect(sourceLocalTime('unknown', 'Europe/Kiev')).toBe('unknown');
  });
  it('removes only proven repeated check-in answers and keeps metadata and unknown formats', () => {
    const context = {
      mood: '🙂',
      metrics: 'Energy: 3/5',
      answers: [{ question: 'How?', answer: 'Better' }],
      extraNotes: 'Walked.',
    };
    const text =
      'Check-in template: Morning\nMood: 🙂\nQuestion: How?\nAnswer: Better\nWalked.';
    const compact = sourceCapsuleInput(text, context);
    expect(compact).toEqual({
      text: 'Check-in template: Morning\nQuestion: How?\nAnswer: Better\nWalked.',
      context: { mood: '🙂', metrics: 'Energy: 3/5' },
    });
    expect(
      sourceCapsuleInput('An older client format', context).context,
    ).toEqual(context);
    expect(context.answers).toHaveLength(1);
    expect(
      sourceCapsuleInput(
        text.replace('Question:', 'Daily note: Important context\nQuestion:'),
        context,
      ).text,
    ).toContain('Daily note: Important context');
    expect(sourceCapsuleInput(text, { answers: [null] }).text).toBe(text);
  });
  it('preserves source time, exact mood and named measurements independently of model omissions', () => {
    const observation = {
      sourceAt: '2026-09-07T05:00:00Z',
      timezone: 'Europe/Kiev',
      structuredContext: {
        mood: '😟',
        metrics: [{ name: 'Stress', value: 4, scale: [1, 5] }],
      },
    };
    const result = withSourceObservation(
      '1. Sent the draft; feedback still pending.',
      observation,
    );
    expect(result).toContain(observation.sourceAt);
    expect(result).toContain('Europe/Kiev');
    expect(result).toContain('😟');
    expect(result).toContain('Stress: 4/5');
    expect(result).not.toContain('"value"');
    expect(result).toContain('not a daily aggregate');
    expect(withSourceObservation('Unknown date', {})).toBe('Unknown date');
  });
  it('uses Luna and the supplied historical date, even when configured memory model differs', async () => {
    const service: any = Object.create(AiService.prototype);
    service.buildMemoryCapsuleOutputRules = jest.fn(async () => 'Language: uk');
    service.runMemoryCapsuleExtraction = jest.fn(async () => ({
      userDigest: '1. Sent the draft. 2. A walk is planned, not completed.',
      userMemory: [],
    }));
    const result = await service.extractUserMemoryDetailsV2(1, {
      text: 'Sent the draft. Tomorrow I plan to walk.',
      sourceType: 'entry',
      sourceAt: '2026-09-07T12:00:00Z',
      timezone: 'Europe/Kiev',
      structuredContext: {
        mood: '🙂',
        metrics: [{ name: 'Energy', value: 3, scale: [1, 5] }],
      },
    });
    const call = service.runMemoryCapsuleExtraction.mock.calls[0];
    expect(call[6].modelOverride).toBe(AiModel.GPT_5_6_LUNA);
    expect(call[1]).toContain('SOURCE TIMESTAMP: 2026-09-07T12:00:00Z');
    expect(call[1]).toContain('Completing one checklist item');
    expect(call[1]).not.toContain('600 characters');
    expect(result.userDigest).toContain('Energy: 3/5');
    expect(call[1]).toContain('Do NOT repeat that metadata');
    expect(result.userDigest).toContain('walk is planned, not completed');
  });
  it('keeps reversed custom scale meanings and compact text from current clients', () => {
    const expected = 'Pain relief: 2/5 (1: Severe pain; 5: No pain)';
    expect(
      compactSourceMetrics([
        {
          id: 'custom:pain',
          name: 'Pain relief',
          value: 2,
          scale: [1, 5],
          lowLabel: 'Severe pain',
          highLabel: 'No pain',
        },
      ]),
    ).toBe(expected);
    expect(compactSourceMetrics(expected)).toBe(expected);
    expect(
      compactSourceMetrics([
        {
          id: 'energy',
          name: 'Energy',
          value: 3,
          scale: [1, 5],
          lowLabel: 'Almost none',
          highLabel: 'Lots',
        },
      ]),
    ).toBe('Energy: 3/5');
  });
});
