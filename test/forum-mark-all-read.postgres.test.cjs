const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const sql = fs.readFileSync(path.join(__dirname, '../src/forum/utils/mark-all-topics-read.ts'), 'utf8').match(/MARK_ALL_TOPICS_READ_SQL = `([\s\S]*?)`;/)[1];
test('bulk read covers unloaded topics, isolates accounts and preserves new replies', { skip: process.env.NEMORY_TEST_LOCAL_POSTGRES !== '1' }, async () => {
  assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST));
  const client = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,connectionTimeoutMillis:10000});
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE forum_topics (id int PRIMARY KEY, status text, deleted_at timestamptz, last_comment_id int) ON COMMIT DROP;
      CREATE TEMP TABLE forum_topic_read_states (user_id int, topic_id int, first_viewed_at timestamptz, last_read_at timestamptz, last_read_comment_id int, individually_read_comment_ids int[] DEFAULT '{}', updated_at timestamptz, UNIQUE(user_id,topic_id)) ON COMMIT DROP;
      CREATE TEMP TABLE forum_topic_watchers (user_id int, topic_id int, last_read_at timestamptz, is_muted boolean) ON COMMIT DROP;
      INSERT INTO forum_topics SELECT n,'published',NULL,NULL FROM generate_series(1,75) n;
      INSERT INTO forum_topics VALUES (76,'hidden',NULL,NULL),(77,'published',now(),NULL);
      INSERT INTO forum_topic_read_states VALUES (8,1,NULL,'2020-01-01',NULL,'{}',NULL),(7,1,NULL,'2020-01-01',NULL,'{123}',NULL);
      INSERT INTO forum_topic_watchers VALUES(7,1,'2020-01-01',true),(8,1,'2020-01-01',false);`);
    await client.query(sql,[7,'published']);
    const states=(await client.query('SELECT * FROM forum_topic_read_states WHERE user_id=7 ORDER BY topic_id')).rows;
    assert.equal(states.length,75); assert.ok(states.every(s=>s.first_viewed_at && s.last_read_at));
    assert.deepEqual(states[0].individually_read_comment_ids,[123]);
    assert.equal((await client.query('SELECT last_read_at FROM forum_topic_read_states WHERE user_id=8')).rows[0].last_read_at.getUTCFullYear(),2020);
    const w=(await client.query('SELECT * FROM forum_topic_watchers WHERE user_id=7')).rows[0];
    assert.equal(w.is_muted,true); assert.equal(+w.last_read_at,+states[0].last_read_at);
    // A comment arriving after the statement remains beyond the read watermark.
    assert.equal((await client.query('SELECT clock_timestamp() > last_read_at AS unread FROM forum_topic_read_states WHERE user_id=7 AND topic_id=1')).rows[0].unread,true);
    await client.query(sql,[7,'published']);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM forum_topic_read_states WHERE user_id=7')).rows[0].n,75);
    // A newer watermark written by a concurrent read must never move backwards.
    await client.query("UPDATE forum_topic_read_states SET last_read_at='2099-01-01',last_read_comment_id=999 WHERE user_id=7 AND topic_id=1");
    await client.query(sql,[7,'published']);
    assert.equal((await client.query('SELECT last_read_comment_id FROM forum_topic_read_states WHERE user_id=7 AND topic_id=1')).rows[0].last_read_comment_id,999);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
