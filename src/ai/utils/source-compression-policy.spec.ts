import { describe, it, expect } from '@jest/globals';
import {
  selectSourceCompression,
  sourceCompressionInstruction,
} from './source-compression-policy';

describe('source compression policy', () => {
  const count = (s: string) => s.length; // deterministic tokenizer boundary, no provider call
  it('keeps short originals without asking the model to reproduce them', () => {
    const original = 'Mixed feelings; promised a call, not yet made.';
    expect(selectSourceCompression(original, '', count)).toMatchObject({
      text: original,
      representation: 'verbatim',
    });
    expect(sourceCompressionInstruction(500)).toContain('empty userDigest');
  });
  it('uses every nonempty generated capsule regardless of size saving', () => {
    const original = 'x'.repeat(1000);
    for (const candidate of [
      'y'.repeat(801),
      'y'.repeat(1000),
      'y'.repeat(1200),
    ])
      expect(selectSourceCompression(original, candidate, count)).toMatchObject(
        {
          text: candidate,
          representation: 'digest',
          reason: 'compressed',
          originalTokens: 1000,
          candidateTokens: candidate.length,
        },
      );
  });
  it('also preserves a generated capsule for a short source', () => {
    expect(
      selectSourceCompression('Short source', ' Capsule ', count),
    ).toMatchObject({
      text: 'Capsule',
      representation: 'digest',
    });
  });
  it('falls back to the original only when the candidate is empty', () => {
    const original = 'x'.repeat(1000);
    for (const candidate of ['', ' \n '])
      expect(selectSourceCompression(original, candidate, count)).toMatchObject(
        {
          text: original,
          representation: 'verbatim',
          reason: 'empty_candidate',
        },
      );
  });
  it('accepts meaningful token savings and never truncates the selected text', () => {
    const candidate = 'a'.repeat(798) + '!?';
    expect(
      selectSourceCompression('x'.repeat(1000), candidate, count),
    ).toMatchObject({ text: candidate, representation: 'digest' });
  });
});
