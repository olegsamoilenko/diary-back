const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const enabled = process.env.NEMORY_TEST_LOCAL_POSTGRES === '1';
const sql = fs.readFileSync(path.join(__dirname, '../src/forum/utils/record-comment-read.ts'), 'utf8').match(/COMPACT_COMMENT_READ_SQL = `([\s\S]*?)`;/)[1];
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');

test('out-of-order reads preserve skipped comments in PostgreSQL', {skip: !enabled}, async t => {
  assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST), 'Local database only');
  const client = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,connectionTimeoutMillis:10000});
  await client.connect();
  try {
    await client.query('BEGIN');
    // Connection-local tables shadow real names; all data is rolled back.
    await client.query(`CREATE TEMP TABLE forum_comments (id uuid PRIMARY KEY, topic_id uuid, author_id int,
      created_at timestamptz, status text DEFAULT 'published', deleted_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE forum_topic_read_states (id uuid PRIMARY KEY, topic_id uuid, user_id int,
      last_read_at timestamptz, last_read_comment_id uuid, individually_read_comment_ids uuid[] NOT NULL DEFAULT '{}',
      updated_at timestamptz) ON COMMIT DROP`);
    const reset=async()=>{
      await client.query('TRUNCATE pg_temp.forum_comments, pg_temp.forum_topic_read_states');
      await client.query(`INSERT INTO pg_temp.forum_topic_read_states (id,topic_id,user_id,last_read_at) VALUES ($1,$2,7,'2026-01-01')`,[id(900),id(800)]);
    };
    const add=async(n,time,author=9,status='published')=>client.query(`INSERT INTO pg_temp.forum_comments(id,topic_id,author_id,created_at,status) VALUES ($1,$2,$3,$4,$5)`,[id(n),id(800),author,time,status]);
    const read=async n=>client.query(sql,[id(900),id(n),'published']);
    const unread=async()=> (await client.query(`SELECT c.id FROM pg_temp.forum_comments c, pg_temp.forum_topic_read_states s
      WHERE c.topic_id=s.topic_id AND c.author_id<>s.user_id AND c.status='published' AND c.deleted_at IS NULL
      AND c.created_at>s.last_read_at AND NOT(c.id=ANY(s.individually_read_comment_ids)) ORDER BY c.created_at,c.id`)).rows.map(r=>r.id);
    await t.test('reply 50 can be read first and persists without marking 1-49 read',async()=>{
      await reset();for(let n=1;n<=60;n++) await add(n,new Date(Date.UTC(2026,0,1,0,0,n)));
      await read(50);await read(50);
      assert.deepEqual(await unread(),Array.from({length:60},(_,i)=>i+1).filter(n=>n!==50).map(id));
      const state=(await client.query('SELECT * FROM pg_temp.forum_topic_read_states')).rows[0];
      assert.deepEqual(state.individually_read_comment_ids,[id(50)]);
      for(let n=1;n<50;n++)await read(n);
      assert.deepEqual(await unread(),Array.from({length:10},(_,i)=>id(51+i)));
      assert.deepEqual((await client.query('SELECT individually_read_comment_ids FROM pg_temp.forum_topic_read_states')).rows[0].individually_read_comment_ids,[]);
    });
    await t.test('equal timestamps and sub-millisecond order do not lose unread comments',async()=>{
      await reset();await add(1,'2026-01-01T01:00:00.000100Z');await add(2,'2026-01-01T01:00:00.000100Z');await add(3,'2026-01-01T01:00:00.000200Z');
      await read(3);await read(1);assert.deepEqual(await unread(),[id(2)]);
      await read(2);assert.deepEqual(await unread(),[]);
    });
    await t.test('own/hidden comments do not block compaction, and mark-all clears exceptions',async()=>{
      await reset();await add(1,'2026-01-01T01:00:00Z',7);await add(2,'2026-01-01T02:00:00Z',9,'hidden');await add(3,'2026-01-01T03:00:00Z');
      await read(3);assert.deepEqual(await unread(),[]);
      await add(4,'2026-01-01T04:00:00Z');await add(5,'2026-01-01T05:00:00Z');await read(5);
      await client.query(`UPDATE pg_temp.forum_topic_read_states SET last_read_at='2026-01-01T06:00:00Z', individually_read_comment_ids='{}'`);
      await read(4);assert.deepEqual(await unread(),[]);
      assert.equal((await client.query('SELECT last_read_at FROM pg_temp.forum_topic_read_states')).rows[0].last_read_at.toISOString(),'2026-01-01T06:00:00.000Z');
    });
  } finally {await client.query('ROLLBACK');await client.end();}
});
