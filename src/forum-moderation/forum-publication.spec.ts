import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
import { DataSource } from 'typeorm';
import { ForumPublication } from './forum-publication';
import { ForumModerationTargetType } from './enums/forum-moderation-target-type.enum';
import { ForumAbuseGuardService } from './services/forum-abuse-guard.service';

describe('Forum publication ownership and persistence', () => {
  const params = {
    userId: 1,
    targetType: ForumModerationTargetType.TOPIC,
    actionType: 'create' as const,
    content: 'test',
  };
  let guard: { renew: jest.Mock<any>; finish: jest.Mock<any> };
  let receipt: any;
  let runner: any;
  let source: DataSource;
  let publication: ForumPublication;
  beforeEach(() => {
    guard = {
      renew: jest.fn<any>().mockResolvedValue(true),
      finish: jest.fn<any>().mockResolvedValue(undefined),
    };
    receipt = {
      key: 'duplicate',
      owner: 'owner',
      rateKey: 'rate',
      windowKey: 'window',
      windowId: 'window1',
    };
    runner = {
      manager: {},
      isTransactionActive: false,
      connect: jest.fn<any>().mockResolvedValue(undefined),
      startTransaction: jest.fn(async () => {
        runner.isTransactionActive = true;
      }),
      commitTransaction: jest.fn(async () => {
        runner.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn(async () => {
        runner.isTransactionActive = false;
      }),
      release: jest.fn<any>().mockResolvedValue(undefined),
    };
    source = { createQueryRunner: () => runner } as unknown as DataSource;
    publication = new ForumPublication(
      guard as unknown as ForumAbuseGuardService,
      async (_params, admitted) => {
        admitted(receipt);
      },
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const failure = new Error('isolated failure');

  it('releases admission after moderation infrastructure failure', async () => {
    publication = new ForumPublication(
      guard as unknown as ForumAbuseGuardService,
      async (_params, admitted) => {
        admitted(receipt);
        throw failure;
      },
    );
    await expect(publication.run((p) => p.moderate(params))).rejects.toBe(
      failure,
    );
    expect(guard.finish).toHaveBeenCalledWith(receipt, false);
  });
  it('retains rejected content even if recording its policy rejection fails', async () => {
    publication = new ForumPublication(
      guard as unknown as ForumAbuseGuardService,
      async (_params, admitted) => {
        admitted(receipt);
        receipt.policyRejected = true;
        throw failure;
      },
    );
    await expect(publication.run((p) => p.moderate(params))).rejects.toBe(
      failure,
    );
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('refunds a confirmed rollback, including moderation inside the transaction', async () => {
    await expect(
      publication.run((p) =>
        p.transaction(source, async () => {
          await p.moderate(params);
          throw failure;
        }),
      ),
    ).rejects.toBe(failure);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(guard.finish).toHaveBeenCalledWith(receipt, false);
  });
  it('retains after successful commit and returns the original result', async () => {
    const result = await publication.run(async (p) => {
      await p.moderate(params);
      return p.transaction(source, async () => ({ id: 'persisted' }));
    });
    expect(result).toEqual({ id: 'persisted' });
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('does not unlock persisted content when a subsequent notification/read fails', async () => {
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        await p.transaction(source, async () => undefined);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('retains an unknown COMMIT outcome even after a successful ROLLBACK', async () => {
    runner.commitTransaction.mockRejectedValue(failure);
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        return p.transaction(source, async () => undefined);
      }),
    ).rejects.toBe(failure);
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('retains when rollback itself fails', async () => {
    runner.rollbackTransaction.mockRejectedValue(new Error('connection lost'));
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        return p.transaction(source, async () => {
          throw failure;
        });
      }),
    ).rejects.toBe(failure);
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('never writes when another request owns the reservation', async () => {
    const write = jest.fn<any>();
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        guard.renew.mockResolvedValue(false);
        return p.transaction(source, write);
      }),
    ).rejects.toThrow('reservation lost');
    expect(write).not.toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });
  it('checks ownership again before commit', async () => {
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        return p.transaction(source, async () => {
          guard.renew.mockResolvedValue(false);
        });
      }),
    ).rejects.toThrow('reservation lost');
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalled();
  });
  it('renews while processing and stops on completion', async () => {
    jest.useFakeTimers();
    await publication.run(async (p) => {
      await p.moderate(params);
      await jest.advanceTimersByTimeAsync(660_000);
    });
    expect(guard.renew).toHaveBeenCalledTimes(12);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(guard.renew).toHaveBeenCalledTimes(12);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not replace the original error when Redis finalization fails', async () => {
    guard.finish.mockRejectedValue(new Error('Redis unavailable'));
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
  it('does not turn committed success into failure on connection release failure', async () => {
    runner.release.mockRejectedValue(failure);
    await expect(
      publication.run(async (p) => {
        await p.moderate(params);
        return p.transaction(source, async () => 'saved');
      }),
    ).resolves.toBe('saved');
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
});
