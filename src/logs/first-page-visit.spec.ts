import { describe, expect, it, jest } from '@jest/globals';
import { LogsService } from './logs.service';
import { shouldSendEvent } from './event-policy';

const visit = {
  userId: 7,
  userUuid: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  ts: 10000,
  kind: 'ui',
  level: 'info',
  name: 'page_first_open_settings_plans',
} as const;

describe('page visits in the normal log batch', () => {
  it('allows known named pages and excludes creation forms, generic events and raw paths', () => {
    for (const name of [
      'page_first_open',
      'page_first_open_planner_tasks_new',
      'page_first_open_conversation/123',
      'db_success',
      'request_success',
    ]) {
      expect(shouldSendEvent(name, 'info')).toBe(false);
    }
    expect(shouldSendEvent(visit.name, 'info')).toBe(true);
  });
  it.each([
    { first: null, inserted: 1, updated: 0 },
    { first: new Date(9000).toISOString(), inserted: 0, updated: 0 },
    { first: new Date(11000).toISOString(), inserted: 0, updated: 1 },
  ])(
    'retains the first opening when previously recorded at $first',
    async ({ first, inserted, updated }) => {
      const manager = {
        query: jest.fn(async () => [{ first }]),
        insert: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      };
      const transaction = (run: (m: typeof manager) => Promise<unknown>) =>
        run(manager);
      const service = new LogsService(
        { manager: { transaction } } as never,
        {} as never,
      );
      const res = await service.ingestBatch(
        { events: [visit, { ...visit, kind: 'app', name: 'app_start' }] },
        {},
      );
      expect(res).toEqual({ inserted: inserted + 1, pageVisitsHandled: true });
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [7, visit.userUuid, 'settings-plans'],
      );
      expect(manager.insert).toHaveBeenCalledTimes(inserted + 1);
      expect(manager.update).toHaveBeenCalledTimes(updated);
      if (inserted)
        expect(manager.insert).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({
            name: visit.name,
            userId: 7,
            data: { page: 'settings-plans' },
          }),
        );
    },
  );
});
