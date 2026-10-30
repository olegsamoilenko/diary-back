import { describe, expect, it, jest } from '@jest/globals';
import { withFreshGooglePlaySnapshot } from './google-play-snapshot';

describe('NA-59 snapshot retry errors', () => {
  it('retries the purchase-token unique race after the failed transaction returns', async () => {
    const db = {
      query: jest
        .fn<() => Promise<{ id: string; revision: string }[]>>()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: '1', revision: '22' }]),
    };
    const apply = jest
      .fn<(revision: string | null) => Promise<string>>()
      .mockRejectedValueOnce({
        driverError: {
          code: '23505',
          constraint: 'uq_store_subscriptions_purchase_token',
        },
      })
      .mockResolvedValue('ok');
    await expect(
      withFreshGooglePlaySnapshot(db as any, 'synthetic', apply),
    ).resolves.toBe('ok');
    expect(apply.mock.calls.map(([version]) => version)).toEqual([
      null,
      '1:22',
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['synthetic']);
  });

  it.each([
    new Error('provider unavailable'),
    { driverError: { code: '23505', constraint: 'other_unique_index' } },
    { driverError: { code: '40P01' } },
  ])(
    'propagates non-snapshot failures without a retry loop (%#)',
    async (error) => {
      const db = {
        query: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      };
      const apply = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      await expect(
        withFreshGooglePlaySnapshot(db as any, 'synthetic', apply),
      ).rejects.toBe(error);
      expect(apply).toHaveBeenCalledTimes(1);
    },
  );
});
