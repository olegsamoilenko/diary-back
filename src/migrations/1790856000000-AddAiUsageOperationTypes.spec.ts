import { describe, expect, it, jest } from '@jest/globals';
import { AddAiUsageOperationTypes1790856000000 } from './1790856000000-AddAiUsageOperationTypes';

describe('AI usage classification migration', () => {
  it('preserves existing enum values and backfills only exact known operations', async () => {
    const query = jest.fn(async (sql: string) =>
      sql.startsWith('SELECT')
        ? [{ value: 'dialog' }, { value: 'future_type' }]
        : [],
    );
    await new AddAiUsageOperationTypes1790856000000().up({ query } as never);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements.find((sql) => sql.startsWith('CREATE TYPE'))).toContain(
      "'future_type'",
    );
    const backfill = statements.find((sql) => sql.startsWith('UPDATE'))!;
    expect(backfill).toContain("WHERE type::text = 'dialog' AND operation IN");
    expect(backfill).toContain(
      "'generate_conversation_response' THEN 'conversation'",
    );
    expect(backfill).toContain(
      "'generate_periodic_analysis_dialog_response' THEN 'periodic_analysis_dialog'",
    );
    expect(backfill).not.toContain('Credits');
    expect(backfill).not.toContain('extract_assistant_memory');
  });
});
