import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { it, expect } from '@jest/globals';
import { buildJournalTask } from './journal-response-instructions';
import { buildConversationTask } from '../conversation/conversation.context';

const root = resolve(__dirname, '../../..');
const baseline = JSON.parse(
  readFileSync(
    resolve(
      root,
      'docs/prompt-history/20261108-planner-contract/protected-prompts.json',
    ),
    'utf8',
  ),
) as {
  values: {
    name: string;
    path: string;
    start: string | null;
    end: string | null;
    sha256: string;
  }[];
};
it.each(baseline.values)(
  'preserves psychology, practical value and steps verbatim: $name',
  (block) => {
    const source = readFileSync(resolve(root, block.path), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    const start = block.start ? source.indexOf(block.start) : 0;
    const end = block.end ? source.indexOf(block.end, start) : source.length;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(
      createHash('sha256').update(source.slice(start, end)).digest('hex'),
    ).toBe(block.sha256);
  },
);

// These fixtures contain the actual instruction text before the lint cleanup.
// A failure shows which words changed, including in legacy and planner flows.
const examples = JSON.parse(
  readFileSync(
    resolve(
      root,
      'docs/prompt-history/20261108-planner-contract/rendered-tasks.json',
    ),
    'utf8',
  ),
) as {
  journal: Array<{
    params: Parameters<typeof buildJournalTask>[0];
    structured: boolean;
    expected: string;
  }>;
  conversations: Array<{
    changes: boolean | 'chat';
    expected: ReturnType<typeof buildConversationTask>;
  }>;
};

it.each(examples.journal)(
  'preserves the rendered $params.mode task (first=$params.isFirstEntry, structured=$structured)',
  ({ params, structured, expected }) => {
    expect(buildJournalTask(params, structured)).toBe(expected);
  },
);

it.each(examples.conversations)(
  'preserves standalone conversation instructions with planner changes=$changes',
  ({ changes, expected }) => {
    expect(buildConversationTask(800, changes, true)).toEqual(expected);
  },
);

it('guides manual creation when the conversation client omits planner support', () => {
  const { instructions } = buildConversationTask(800);
  expect(instructions).toContain(
    'Explicit reminder with clear timing: acknowledge scheduling in progress',
  );
  expect(instructions).toContain('the app confirms success');
  expect(instructions).toContain('Other planners: manual creation');
  expect(instructions).not.toContain('Planner creation available.');
  expect(
    buildConversationTask(800, false, false, 2).instructions,
  ).not.toContain('acknowledge scheduling');
});
