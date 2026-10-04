import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  acceptContextAuditPart,
  flushContextAudit,
  writeContextAudit,
} from './context-audit';
jest.mock('node:fs', () => ({ existsSync: () => true }));
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  appendFile: jest.fn(async () => undefined),
}));

describe('local context audit files', () => {
  const oldEnvironment = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    jest.mocked(appendFile).mockClear();
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = oldEnvironment;
    jest.restoreAllMocks();
  });
  it('reassembles complete context exactly once, including Unicode and capsule content', async () => {
    const prompt = [
      {
        role: 'system',
        content: '  \r\n\tУкраїна 👋 e\u0301\u00a0 '.repeat(100),
      },
    ];
    const envelope = {
      id: 'test-unicode-1',
      source: 'frontend',
      stage: 'context.reused',
      loggedAt: '2026-09-20T00:00:00Z',
      payload: { prompt, promptJson: JSON.stringify(prompt) },
    };
    const raw = JSON.stringify(envelope);
    const count = Math.ceil(raw.length / 400);
    for (let index = count - 1; index >= 0; index--) {
      const part = {
        id: envelope.id,
        index,
        count,
        text: raw.slice(index * 400, (index + 1) * 400),
      };
      acceptContextAuditPart(part);
      acceptContextAuditPart(part);
    }
    await flushContextAudit();
    expect(appendFile).toHaveBeenCalledTimes(2);
    const [path, contents] = jest.mocked(appendFile).mock.calls[0];
    expect(path).toContain(resolve(process.cwd(), '..', 'diary-front', '.tmp'));
    const saved = JSON.parse(String(contents));
    expect(saved.payload).toEqual(envelope.payload);
    expect(saved.id).toBe(envelope.id);
    expect(saved.fingerprints.prompt.characters).toBeGreaterThan(0);
    expect(String(contents)).toContain('Україна');
  });
  it('writes backend snapshots independently without mutating the request', async () => {
    const payload = { data: { prompt: [{ role: 'user', content: 'text' }] } };
    writeContextAudit('request.received', payload);
    payload.data.prompt[0].content = 'changed';
    await flushContextAudit();
    const [path, contents] = jest.mocked(appendFile).mock.calls[0];
    expect(path).toContain(resolve(process.cwd(), '.tmp'));
    expect(JSON.parse(String(contents)).payload.data.prompt[0].content).toBe(
      'text',
    );
    expect(payload.data.prompt[0].content).toBe('changed');
  });
  it('does not write production diagnostics or incomplete/invalid fragments', async () => {
    process.env.NODE_ENV = 'production';
    writeContextAudit('request.received', { promptJson: 'private' });
    acceptContextAuditPart({ id: 'prod', index: 0, count: 1, text: '{}' });
    process.env.NODE_ENV = 'development';
    acceptContextAuditPart({ id: 'partial', index: 0, count: 2, text: '{' });
    acceptContextAuditPart({ id: '../../bad', index: 0, count: 1, text: '{}' });
    await flushContextAudit();
    expect(appendFile).not.toHaveBeenCalled();
  });
});
