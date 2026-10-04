import { expect, it, jest } from '@jest/globals';
import { AddDiaryStatAiInput1790208000000 } from './1790208000000-AddDiaryStatAiInput';

it.each([false, true])(
  'adds nullable columns safely when synchronize already ran: %s',
  async (alreadySynchronized) => {
    const runner = {
      query: jest.fn(async () => undefined),
      getTable: jest.fn(async () => ({
        indices: alreadySynchronized ? [{ columnNames: ['aiTraceId'] }] : [],
      })),
      createIndex: jest.fn(async () => undefined),
    };
    await new AddDiaryStatAiInput1790208000000().up(runner as any);
    const sql = runner.query.mock.calls.map((call: any) => call[0]).join('\n');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(
      sql.match(/ADD COLUMN IF NOT EXISTS "inputTokens" integer/g),
    ).toHaveLength(4);
    expect(
      sql.match(/ADD COLUMN IF NOT EXISTS "inputCredits" integer/g),
    ).toHaveLength(4);
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toContain('DEFAULT 0');
    expect(runner.createIndex).toHaveBeenCalledTimes(
      alreadySynchronized ? 0 : 4,
    );
  },
);
