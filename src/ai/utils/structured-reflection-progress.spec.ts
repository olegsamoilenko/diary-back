import { describe, expect, it } from '@jest/globals';
import { createStructuredReflectionProgress } from './structured-reflection-progress';

describe('createStructuredReflectionProgress', () => {
  it('emits only new decoded shortText characters from streamed JSON', () => {
    const chunks: string[] = [];
    const progress = createStructuredReflectionProgress((chunk) =>
      chunks.push(chunk),
    );

    progress.push('{"shortText":"Привіт');
    progress.push('\\nсві');
    progress.push('т","fullText":"Повна відповідь"}');
    progress.finish(
      '{"shortText":"Привіт\\nсвіт","fullText":"Повна відповідь"}',
    );

    expect(chunks.join('')).toBe('Привіт\nсвіт');
  });

  it('waits for an incomplete unicode escape before emitting it', () => {
    const chunks: string[] = [];
    const progress = createStructuredReflectionProgress((chunk) =>
      chunks.push(chunk),
    );

    progress.push('{"shortText":"A\\u');
    progress.push('0411"}');

    expect(chunks.join('')).toBe('AБ');
  });
});
