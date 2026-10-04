import { describe, expect, it } from '@jest/globals';
import {
  createStructuredReflectionProgress,
  findPartialJsonStringProperty,
} from './structured-reflection-progress';

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

it('streams analysis text without exposing capsule or JSON syntax, including buffered responses', () => {
  const chunks: string[] = [];
  const progress = createStructuredReflectionProgress(
    (chunk) => chunks.push(chunk),
    'text',
  );
  progress.push('{"text":"First');
  progress.push(' sentence","capsule":"PRIVATE SUMMARY"}');
  progress.finish('{"text":"First sentence","capsule":"PRIVATE SUMMARY"}');
  expect(chunks.join('')).toBe('First sentence');
  const buffered: string[] = [];
  createStructuredReflectionProgress(
    (chunk) => buffered.push(chunk),
    'text',
  ).finish('{"text":"Batched answer","capsule":"summary"}');
  expect(buffered).toEqual(['Batched answer']);
});

it('recovers received text without incomplete JSON escapes or auxiliary fields', () => {
  expect(
    findPartialJsonStringProperty('{"text":"First\\nSecond\\u04', 'text'),
  ).toBe('First\nSecond');
  expect(
    findPartialJsonStringProperty(
      '{"text":"Use \\"pause\\"","capsule":"private',
      'text',
    ),
  ).toBe('Use "pause"');
  expect(findPartialJsonStringProperty('{"other":"value', 'text')).toBeNull();
});
