import { describe, expect, it } from '@jest/globals';

import { buildLongitudinalResponseGuidance } from './longitudinal-response-guidance';

describe('buildLongitudinalResponseGuidance', () => {
  const modes = ['entry', 'dialog', 'checkin', 'checkin_dialog'] as const;

  it.each(modes)('keeps one unified longitudinal method in %s mode', (mode) => {
    const prompt = buildLongitudinalResponseGuidance(
      mode,
      'memory_capsules_v2',
    );

    expect(
      prompt.match(/MEMORY CONTEXT AND LONGITUDINAL REASONING/g),
    ).toHaveLength(1);
    expect(prompt).toContain('entries and check-ins of both types');
    expect(prompt).toContain('long-term user memory from every life domain');
    expect(prompt).toContain(
      'THIS ENTIRE SECTION IS A MANDATORY EXECUTION CONTRACT',
    );
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN SEARCH');
    expect(prompt).toContain('supplied evidence from EVERY other life domain');
    expect(prompt).toContain('Examine every supplied memory item');
    expect(prompt).toContain('or the first cross-domain match');
    expect(prompt).toContain('MANDATORY CROSS-DOMAIN OUTPUT GATE');
    expect(prompt).toContain(
      'using 3 or 4 concrete examples from distinct other life domains',
    );
    expect(prompt).toContain(
      'If only 1 or 2 qualifying cross-domain examples are supplied',
    );
    expect(prompt).toContain(
      'never invent an example and never use more than 4',
    );
    expect(prompt).toContain('transfers across the connected domains');
    expect(prompt).not.toContain('MANDATORY COMPLETE EVIDENCE INVENTORY');
    expect(prompt).not.toContain('MANDATORY OUTPUT ORDER AND COVERAGE GATE');
    expect(prompt).not.toContain('MANDATORY PATTERN-LEVEL SOLUTION GATE');
    expect(prompt).toContain(
      'A recurring pattern requires at least one specific past occurrence plus the current occurrence',
    );
    expect(prompt).toContain('Use chronology as evidence, not proof');
    expect(prompt).toContain('If history shows improvement');
    expect(prompt).toContain(
      'never invent a pattern or mention history merely to prove that memory was read',
    );
  });

  it('describes assembled context semantics only for the technical marker', () => {
    const prompt = buildLongitudinalResponseGuidance(
      'entry',
      'memory_capsules_v2',
    );

    expect(prompt).toContain('[MEMORY_CAPSULES_V2]');
    expect(prompt).toContain('[ACTIVE_NEMORY_COMMITMENTS]');
    expect(prompt).toContain('[RELEVANT_PREVIOUS_ENTRIES]');
    expect(prompt).toContain('[LONG_TERM_USER_MEMORY]');
    expect(prompt).toContain('NEMORY_LONG_TERM_MEMORY_FROM_REFLECTION');
    expect(prompt).toContain('FOLLOW_UP_DIALOG_MEMORY');
    expect(prompt).toContain(
      'Interpret those two parts as one dialog turn, keep separate turns distinct',
    );
    expect(prompt).toContain('They are not summaries of that response');
    expect(prompt).toContain('duration=one_time');
    expect(prompt).not.toContain('CONTEXT PROTOCOL — MEMORY CAPSULES V2');
  });

  it('describes separate context blocks without version wording', () => {
    const prompt = buildLongitudinalResponseGuidance('entry');

    expect(prompt).toContain('[USER_MEMORY]');
    expect(prompt).toContain('[ASSISTANT_MEMORY]');
    expect(prompt).toContain('[ASSISTANT_COMMITMENTS]');
    expect(prompt).toContain('Previous journal entry');
    expect(prompt).toContain(
      'Treat supplied commitments as active unless the context shows',
    );
    expect(prompt).not.toContain('[MEMORY_CAPSULES_V2]');
    expect(prompt).not.toMatch(/legacy|v1|v2/i);
  });

  it.each(modes)(
    'keeps calendar, opening, and commitment gates in %s mode',
    (mode) => {
      const prompt = buildLongitudinalResponseGuidance(mode);

      expect(prompt).toContain('CALENDAR WORDING FOR DATED CONTEXT');
      expect(prompt).toContain('last week');
      expect(prompt).toContain('in the middle of July');
      expect(prompt).toContain('earlier that day');
      expect(prompt).toContain('ACTIVE COMMITMENTS AND NEW PROMISES');
      expect(prompt).toContain('match its trigger or condition semantically');
      expect(prompt).toContain('honor the commitment explicitly');
      expect(prompt).toContain('Advice or a generic offer of help');
      expect(prompt).toContain('NON-TEMPLATED OPENINGS');
      expect(prompt).toContain('direct affirmative observation');
      expect(prompt).toContain('не X, а Y');
    },
  );

  it('keeps cross-domain examples in fullText and shortText on the mechanism', () => {
    expect(buildLongitudinalResponseGuidance('entry')).toContain(
      'Apply the mandatory cross-domain output gate to fullText only',
    );
    expect(buildLongitudinalResponseGuidance('checkin')).toContain(
      'shortText must stay focused on the central mechanism',
    );
  });

  it('keeps dialog answers aimed at the latest message', () => {
    expect(buildLongitudinalResponseGuidance('dialog')).toContain(
      "direct answer to the user's current dialog message",
    );
    expect(buildLongitudinalResponseGuidance('checkin_dialog')).toContain(
      "direct answer to the user's current dialog message",
    );
  });
});
