import { DataSource, EntityManager } from 'typeorm';

// xmin is compared only across one verification request, not used as a durable
// or ordered ID. It also detects updates made by another backend process.
type Revision = string | null;
type QueryRunner = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
class GooglePlaySnapshotChanged extends Error {}

async function readRevision(
  reader: QueryRunner,
  purchaseToken: string,
): Promise<Revision> {
  const rows: { id: string; revision: string }[] = await reader.query(
    'SELECT id::text AS id, xmin::text AS revision FROM store_subscriptions WHERE "purchaseToken" = $1',
    [purchaseToken],
  );
  return rows.length ? `${rows[0].id}:${rows[0].revision}` : null;
}

export async function lockGooglePlayToken(
  manager: EntityManager,
  purchaseToken: string,
): Promise<void> {
  // Short transaction lock covers the absent-row case too. No network call is
  // made while it is held. Hash collisions only serialize unrelated writes.
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `google-play:${purchaseToken}`,
  ]);
}

// Call after the existing pessimistic StoreSubscription lookup and before any
// writes. Keep the consumer's existing user/store/state row-lock order.
export async function assertGooglePlaySnapshot(
  manager: EntityManager,
  purchaseToken: string,
  expected: Revision,
): Promise<void> {
  if ((await readRevision(manager, purchaseToken)) !== expected) {
    throw new GooglePlaySnapshotChanged();
  }
}

export async function withFreshGooglePlaySnapshot<T>(
  dataSource: DataSource,
  purchaseToken: string,
  apply: (revision: Revision) => Promise<T>,
): Promise<T> {
  for (;;) {
    const revision = await readRevision(dataSource, purchaseToken);
    try {
      return await apply(revision);
    } catch (error) {
      const pg = (
        error as { driverError?: { code?: string; constraint?: string } }
      )?.driverError;
      // The unique key also protects creation racing with older code which
      // does not yet participate in the advisory lock. The failed transaction
      // has rolled back before this retry re-reads Google outside any lock.
      if (
        !(error instanceof GooglePlaySnapshotChanged) &&
        !(
          pg?.code === '23505' &&
          pg.constraint === 'uq_store_subscriptions_purchase_token'
        )
      )
        throw error;
    }
  }
}
