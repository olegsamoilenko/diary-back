import { describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import type { Log } from './entities/log.entity';
import type { ServerHttpLog } from './entities/server-http-logs.entity';
import { LogsService } from './logs.service';
import { acceptContextAuditPart, CONTEXT_AUDIT_EVENT } from './context-audit';

jest.mock('./context-audit', () => ({
  CONTEXT_AUDIT_EVENT: 'NEMORY_CONTEXT_AUDIT_PART',
  acceptContextAuditPart: jest.fn(),
}));

describe('context audit routing', () => {
  it('keeps audit fragments out of the logs DB while saving ordinary events', async () => {
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const repository = { createQueryBuilder: jest.fn(() => query) };
    const service = new LogsService(
      repository as unknown as Repository<Log>,
      {} as Repository<ServerHttpLog>,
    );
    const fragment = { id: 'sample', index: 0, count: 1, text: '{}' };
    const audit = {
      ts: 123,
      level: 'info' as const,
      kind: 'ai' as const,
      name: CONTEXT_AUDIT_EVENT,
      data: fragment,
    };
    expect(await service.ingestBatch({ events: [audit] }, {})).toEqual({
      inserted: 0,
    });
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(acceptContextAuditPart).toHaveBeenCalledWith(fragment);
    expect(
      await service.ingestBatch(
        { events: [audit, { ...audit, name: 'ordinary', data: { ok: true } }] },
        {},
      ),
    ).toEqual({ inserted: 1 });
    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'ordinary', data: { ok: true } }),
    ]);
  });
});
