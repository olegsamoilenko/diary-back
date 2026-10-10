import { expect, it, jest } from '@jest/globals';
import { SplitCheckinAiAnalysisDefault1791568800000 } from './1791568800000-SplitCheckinAiAnalysisDefault';

it('backfills only unset preferences and tolerates an already synchronized schema', async () => {
  const query = jest.fn<(sql: string) => Promise<void>>().mockResolvedValue(undefined);
  await new SplitCheckinAiAnalysisDefault1791568800000().up({ query } as any);
  expect(query.mock.calls[0][0]).toContain('ADD COLUMN IF NOT EXISTS');
  expect(query.mock.calls[0][0]).toContain('DEFAULT NULL');
  expect(query.mock.calls[1][0]).toContain(
    'SET "checkinAiAnalysisEnabledByDefault" = "aiAnalysisEnabledByDefault"',
  );
  expect(query.mock.calls[1][0]).toContain(
    'WHERE "checkinAiAnalysisEnabledByDefault" IS NULL',
  );
});
