import { describe, expect, it } from '@jest/globals';

import { buildLongitudinalResponseGuidance } from './longitudinal-response-guidance';

describe('buildLongitudinalResponseGuidance', () => {
  const modes = ['entry', 'dialog', 'checkin', 'checkin_dialog'] as const;

  it.each(modes)('requires longitudinal reasoning in %s mode', (mode) => {
    const prompt = buildLongitudinalResponseGuidance(mode);

    expect(prompt).toContain('entries and check-ins of BOTH types');
    expect(prompt).toContain(
      'make both the connection and its timing visible in the response',
    );
    expect(prompt).toContain('system-level way to interrupt it');
    expect(prompt).toContain('A shared generic tag by itself is not enough');
    expect(prompt).toContain(
      'repeated dated memories as intentional longitudinal evidence',
    );
    expect(prompt).toContain('separate events on separate dates');
    expect(prompt).toContain(
      'Several memory items that describe the same single event count as one occurrence',
    );
    expect(prompt).toContain(
      'whether it is intensifying, weakening, changing form',
    );
    expect(prompt).toContain('the intervals between dated occurrences');
    expect(prompt).toContain(
      'Do not stop at vague wording such as "this appeared before"',
    );
    expect(prompt).toContain('a few days ago');
    expect(prompt).toContain('last week');
    expect(prompt).toContain('at the end of April');
    expect(prompt).toContain('Treat temporal spacing as evidence, not proof');
    expect(prompt).toContain('clustered across days or weeks');
    expect(prompt).toContain('returning after months');
    expect(prompt).toContain(
      'whether the situation, reaction, mechanism, and cost truly match',
    );
    expect(prompt).toContain(
      'mention chronology merely to prove that memory was read',
    );
    expect(prompt).toContain(
      'develop what has already been discussed, not mechanically repeat the same advice',
    );
    expect(prompt).toContain(
      'long-term Nemory memory extracted from a previous reflection',
    );
    expect(prompt).toContain('not as a summary or retelling');
    expect(prompt.toLowerCase()).toContain(
      'do not mechanically avoid every repeated point',
    );
    expect(prompt).toContain('brand-new discovery');
  });

  it.each(modes)('forbids repetitive openings in %s mode', (mode) => {
    const prompt = buildLongitudinalResponseGuidance(mode);

    expect(prompt).toContain('Do not use a reusable contrast formula');
    expect(prompt).toContain('Hard first-sentence gate');
    expect(prompt).toContain('direct affirmative observation');
    expect(prompt).toContain('не X, а Y');
    expect(prompt).toContain('This gate is a hard output constraint');
    expect(prompt).toContain('Проблема тут не в тому');
    expect(prompt).toContain('Головне тут не те');
    expect(prompt).toContain('Це не стільки..., скільки...');
  });

  it.each(modes)('makes accepted commitments explicit in %s mode', (mode) => {
    const prompt = buildLongitudinalResponseGuidance(mode);

    expect(prompt).toContain('Commitment wording discipline');
    expect(prompt).toContain('inspect every active Nemory commitment');
    expect(prompt).toContain('run a semantic trigger check');
    expect(prompt).toContain('Match the meaning of the trigger or condition');
    expect(prompt).toContain(
      "When an active commitment's trigger or condition is materially present",
    );
    expect(prompt).toContain('honor it explicitly and recognizably');
    expect(prompt).toContain(
      'do not merely let the promise influence the answer silently',
    );
    expect(prompt).toContain('pre-send gate');
    expect(prompt).toContain(
      'Honoring an ongoing commitment once does not complete or cancel it',
    );
    expect(prompt).toContain(
      'Only a one-time commitment may be considered fulfilled',
    );
    expect(prompt).toContain('Do not invent a promise');
    expect(prompt).toContain(
      'If the user explicitly asks Nemory to do something in a future interaction and you accept',
    );
    expect(prompt).toContain('state the accepted obligation plainly');
    expect(prompt).toContain('Advice for the user is not a Nemory commitment');
  });

  it('applies the rule to both reflection variants', () => {
    expect(buildLongitudinalResponseGuidance('entry')).toContain(
      'both shortText and fullText',
    );
    expect(buildLongitudinalResponseGuidance('checkin')).toContain(
      'both shortText and fullText',
    );
    expect(buildLongitudinalResponseGuidance('entry')).toContain(
      'first sentence of shortText and the first sentence of fullText',
    );
  });

  it('keeps dialog answers direct', () => {
    expect(buildLongitudinalResponseGuidance('dialog')).toContain(
      "direct answer to the user's current dialog message",
    );
    expect(buildLongitudinalResponseGuidance('checkin_dialog')).toContain(
      "direct answer to the user's current dialog message",
    );
  });
});
