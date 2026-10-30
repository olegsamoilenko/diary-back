import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  assertGooglePlaySnapshot,
  lockGooglePlayToken,
  withFreshGooglePlaySnapshot,
} from './google-play-snapshot';

// Opt-in LOCAL Docker integration. Never reads application tables. Creates and
// removes only a random test schema in the maintenance database "postgres".
// Credentials stay in memory and are never printed. No .env/application config.
const container = process.env.NA59_POSTGRES_CONTAINER;
const pgDescribe = container ? describe : describe.skip;
pgDescribe('NA-59 PostgreSQL independent connections', () => {
  const schema = `na59_${randomUUID().replace(/-/g, '')}`;
  const token = `na59-${randomUUID()}`;
  let admin: Client;
  let a: Client;
  let b: Client;
  const query = (client: Client) => ({
    query: async (sql: string, parameters?: unknown[]) =>
      (await client.query(sql, parameters)).rows,
  });
  const transaction = async <T>(client: Client, work: () => Promise<T>) => {
    await client.query('BEGIN');
    try {
      const result = await work();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };

  beforeAll(async () => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(container!))
      throw new Error('Invalid local container name');
    const [user, password] = execFileSync(
      'docker',
      ['exec', container!, 'printenv', 'POSTGRES_USER', 'POSTGRES_PASSWORD'],
      { encoding: 'utf8', timeout: 10000 },
    )
      .trimEnd()
      .split(/\r?\n/);
    const binding = execFileSync('docker', ['port', container!, '5432/tcp'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const port = Number(binding.split(/\r?\n/)[0].split(':').pop());
    if (!port || !user || !password)
      throw new Error('Local PostgreSQL test connection unavailable');
    const config = {
      host: '127.0.0.1',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 5000,
    };
    admin = new Client(config);
    a = new Client(config);
    b = new Client(config);
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(
      `CREATE TABLE "${schema}".store_subscriptions (id serial PRIMARY KEY, "purchaseToken" text UNIQUE NOT NULL, "lastOrderId" text, "expiryTime" text, "usedCredits" int NOT NULL DEFAULT 0)`,
    );
    await Promise.all([a.connect(), b.connect()]);
    for (const client of [admin, a, b]) {
      await client.query(`SET search_path TO "${schema}"`);
      // Test-only guard against a broken test leaving a lock indefinitely.
      await client.query("SET statement_timeout = '10s'");
    }
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled([a?.end(), b?.end()]);
    if (admin) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });
  beforeEach(async () => {
    await admin.query('TRUNCATE store_subscriptions');
  });

  it('rejects the old snapshot across connections and preserves usage spent after renewal', async () => {
    await admin.query(
      'INSERT INTO store_subscriptions ("purchaseToken", "lastOrderId", "expiryTime", "usedCredits") VALUES ($1, $2, $3, 50)',
      [token, 'old-order', '2030-11-01'],
    );
    let calls = 0;
    await withFreshGooglePlaySnapshot(
      query(a) as any,
      token,
      async (revision) => {
        calls++;
        // Delayed response: another connection committed renewal and AI usage.
        if (calls === 1) {
          await b.query(
            'UPDATE store_subscriptions SET "lastOrderId"=$1, "expiryTime"=$2, "usedCredits"=123 WHERE "purchaseToken"=$3',
            ['new-order', '2030-12-01', token],
          );
        }
        const order = calls === 1 ? 'old-order' : 'new-order';
        const expiry = calls === 1 ? '2030-11-01' : '2030-12-01';
        return transaction(a, async () => {
          await lockGooglePlayToken(query(a) as any, token);
          await a.query(
            'SELECT id FROM store_subscriptions WHERE "purchaseToken"=$1 FOR UPDATE',
            [token],
          );
          await assertGooglePlaySnapshot(query(a) as any, token, revision);
          await a.query(
            'UPDATE store_subscriptions SET "usedCredits"=CASE WHEN "lastOrderId"=$1 THEN "usedCredits" ELSE 0 END, "lastOrderId"=$1, "expiryTime"=$2 WHERE "purchaseToken"=$3',
            [order, expiry, token],
          );
        });
      },
    );
    expect(calls).toBe(2);
    expect(
      (
        await admin.query(
          'SELECT "lastOrderId", "expiryTime", "usedCredits" FROM store_subscriptions',
        )
      ).rows,
    ).toEqual([
      { lastOrderId: 'new-order', expiryTime: '2030-12-01', usedCredits: 123 },
    ]);
  });

  it('serializes an absent token across connections and releases its lock on rollback', async () => {
    const key = `google-play:${token}`;
    await a.query('BEGIN');
    await b.query('BEGIN');
    try {
      await lockGooglePlayToken(query(a) as any, token);
      expect(
        (
          await b.query(
            'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
            [key],
          )
        ).rows[0].acquired,
      ).toBe(false);
      await a.query('ROLLBACK');
      expect(
        (
          await b.query(
            'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
            [key],
          )
        ).rows[0].acquired,
      ).toBe(true);
    } finally {
      await a.query('ROLLBACK');
      await b.query('ROLLBACK');
    }
  });

  it('detects creation while the first verification is still in flight', async () => {
    let calls = 0;
    await withFreshGooglePlaySnapshot(
      query(a) as any,
      token,
      async (revision) => {
        if (++calls === 1)
          await b.query(
            'INSERT INTO store_subscriptions ("purchaseToken") VALUES ($1)',
            [token],
          );
        return transaction(a, async () => {
          await lockGooglePlayToken(query(a) as any, token);
          await a.query(
            'SELECT id FROM store_subscriptions WHERE "purchaseToken"=$1 FOR UPDATE',
            [token],
          );
          await assertGooglePlaySnapshot(query(a) as any, token, revision);
        });
      },
    );
    expect(calls).toBe(2);
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS count FROM store_subscriptions',
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
