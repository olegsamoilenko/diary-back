// Runs only against a local PostgreSQL server and a transaction-local temp table.
require('dotenv').config({ quiet: true });
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { SeparateWebSearchCredits1793865600000 } = require('../src/migrations/1793865600000-SeparateWebSearchCredits');

async function main() {
  const host = process.env.DB_HOST;
  if (!['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error('This check requires a local PostgreSQL connection.');
  const client = new Client({ host, port: Number(process.env.DB_PORT || 25060),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, connectionTimeoutMillis: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path = pg_temp');
    await client.query(`CREATE TEMP TABLE token_usage_history (
      id integer PRIMARY KEY, operation text, "inputCredits" integer,
      "outputCredits" integer, "totalCredits" integer, "webSearchCalls" integer
    ) ON COMMIT DROP`);
    await client.query(`INSERT INTO token_usage_history VALUES
      (1, 'web_search', 127, 11, 138, 1),
      (2, 'answer', 6, 1, 7, 0),
      (3, 'web_search', 227, 11, 238, 2),
      (4, 'web_search', 27, 11, 38, 1)`);
    const migration = new SeparateWebSearchCredits1793865600000();
    const runner = { query: (sql) => client.query(sql) };
    await migration.up(runner);
    // New writer after schema sync: must not subtract a second time.
    await client.query(`INSERT INTO token_usage_history VALUES
      (5, 'web_search', 27, 11, 138, 1, 100)`);
    const read = async () => (await client.query(`SELECT id, "inputCredits", "outputCredits",
      "webSearchCredits", "totalCredits" FROM token_usage_history ORDER BY id`)).rows;
    const first = await read();
    assert.deepEqual(first.map(r => [r.inputCredits, r.outputCredits, r.webSearchCredits, r.totalCredits]),
      [[27, 11, 100, 138], [6, 1, 0, 7], [27, 11, 200, 238], [27, 11, 0, 38], [27, 11, 100, 138]]);
    await migration.up(runner);
    assert.deepEqual(await read(), first, 'backfill must be idempotent');
    await migration.down(runner);
    const restored = (await client.query('SELECT "inputCredits", "totalCredits" FROM token_usage_history ORDER BY id')).rows;
    assert.deepEqual(restored.map(r => [r.inputCredits, r.totalCredits]), [[127,138],[6,7],[227,238],[27,38],[127,138]]);
    console.log('PASS: real PostgreSQL temp-table backfill, replay, already-separated rows and rollback; totals unchanged.');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
