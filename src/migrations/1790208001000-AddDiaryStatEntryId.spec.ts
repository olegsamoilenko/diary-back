import { expect, it, jest } from '@jest/globals';
import { AddDiaryStatEntryId1790208001000 } from './1790208001000-AddDiaryStatEntryId';

it('adds optional source IDs and owner-scoped indexes safely after synchronize', async () => {
  const runner = { query: jest.fn(async (_sql: string) => undefined) };
  await new AddDiaryStatEntryId1790208001000().up(runner as any);
  const sql = runner.query.mock.calls.map(([query]) => query).join('\n');
  expect(sql.match(/ADD COLUMN IF NOT EXISTS "entryId" varchar\(128\)/g)).toHaveLength(4);
  expect(sql.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(4);
  expect(sql).toContain('ON "dialogs_stats" ("userId", "entryId")');
  for (const table of ['entries_stats', 'checkins_stats', 'checkin_dialogs_stats']) {
    expect(sql).toContain(`ON "${table}" ("user_id", "entryId")`);
  }
  expect(sql).not.toMatch(/NOT NULL|DEFAULT|REFERENCES/);
});

it('rolls back only the source IDs and their indexes', async () => {
  const runner = { query: jest.fn(async (_sql: string) => undefined) };
  await new AddDiaryStatEntryId1790208001000().down(runner as any);
  const sql = runner.query.mock.calls.map(([query]) => query).join('\n');
  expect(sql.match(/DROP COLUMN IF EXISTS "entryId"/g)).toHaveLength(4);
  expect(sql.match(/DROP INDEX IF EXISTS/g)).toHaveLength(4);
  expect(sql).not.toMatch(/inputTokens|inputCredits|aiTraceId/);
});
