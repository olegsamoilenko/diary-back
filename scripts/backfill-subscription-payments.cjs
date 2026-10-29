/* Local-only historical import. Dry run by default; --apply commits atomically.
 * Never bootstrap AppModule, grant access, consume purchases or change wallets.
 */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const insertSql = `INSERT INTO payments
  (platform,"regionCode","orderId",amount,currency,"userId",provider,"basePlanId",
   "productId","packageName","testPurchase","orderState","developerRevenue",
   "taxAmount","createdAt","financialDetailsPending","financialDetailsLastAttemptAt")
  VALUES ('android',$1,$2,$3,$4,$5,'GOOGLE_PLAY',$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
  ON CONFLICT ("orderId") DO NOTHING RETURNING id`;

async function insertPrepared(db, rows) {
  let inserted = 0;
  for (const row of rows) {
    const result = await db.query(insertSql, [row.region, row.orderId, row.amount,
      row.currency, row.userId, row.basePlanId, row.productId, row.packageName,
      row.test, row.state, row.developerRevenue, row.taxAmount, row.paidAt,
      row.developerRevenue === null || ['PENDING','PENDING_REFUND'].includes(row.state)]);
    inserted += result.rows.length;
  }
  return inserted;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  require('ts-node').register({transpileOnly:true});
  require('tsconfig-paths/register');
  const env = require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  Object.assign(process.env,env);
  const {Client} = require('pg');
  const {GooglePlaySubscriptionsService} = require('../src/iap/google-play-subscriptions.service');
  const {FINANCE_ORDER_CANDIDATES_SQL} = require('../src/finance-statistics/admin-finance.service');
  const {FINANCE_PRODUCTS} = require('../src/finance-statistics/admin-finance-report');
  const {googleMoneyDecimal,googleOrderDeductions} = require('../src/payments/google-order-finance');
  const db = new Client({host:'127.0.0.1',port:5432,user:env.DB_USER,password:env.DB_PASSWORD,
    database:env.DB_DATABASE,connectionTimeoutMillis:5000,query_timeout:15000});
  await db.connect();
  try {
    const candidates = (await db.query(`WITH candidates AS (${FINANCE_ORDER_CANDIDATES_SQL}),
      owners AS (
        SELECT "lastOrderId" AS "orderId", "userId" FROM store_subscriptions
        UNION ALL SELECT COALESCE(NULLIF("orderId",''),"googleOrderId"),"userId"
        FROM paid_plan_events WHERE "eventType" IN (
          'SUBSCRIPTIONS_GOOGLE_PLAY_SUBSCRIBED','SUBSCRIPTIONS_PUBSUB_UPDATED',
          'SUBSCRIPTIONS_GOOGLE_PLAY_RECONCILED','SUBSCRIPTIONS_PUBSUB_RECOVERED_FROM_OBFUSCATED_ACCOUNT',
          'SUBSCRIPTIONS_PUBSUB_STORE_UPDATED_WITHOUT_USER'))
      SELECT c.*, ARRAY(SELECT DISTINCT u.id FROM owners o JOIN users u ON u.id=o."userId"
        WHERE o."orderId"=c."orderId") AS "userIds",
        EXISTS(SELECT 1 FROM payments p WHERE p."orderId"=c."orderId") AS existing
      FROM candidates c`)).rows;
    assert(candidates.length <= 2000,'Candidate cap reached; split the import before applying');
    const missing = candidates.filter(c=>!c.existing);
    assert(missing.every(c=>c.userIds.length <= 1),'Conflicting order ownership; no writes performed');
    const google = new GooglePlaySubscriptionsService();
    const prepared = []; const failures = []; let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,missing.length)},async()=>{
      while(cursor<missing.length) {
        const c = missing[cursor++];
        try {
          const packageName = c.package || env.GOOGLE_PLAY_PACKAGE_NAME || 'com.soniac12.nemory';
          const {data:o} = await google.android.orders.get({packageName,orderId:c.orderId,
            fields:'orderId,state,total,tax,developerRevenueInBuyerCurrency,createTime,orderHistory(processedEvent),buyerAddress(buyerCountry),lineItems(productId,subscriptionDetails(basePlanId))'},
            {timeout:5000,retry:false});
          assert.equal(o.orderId,c.orderId,'Order mismatch');
          assert.equal(o.lineItems?.length,1,'Unexpected line items');
          const line=o.lineItems[0];const basePlanId=line.subscriptionDetails?.basePlanId;
          assert(FINANCE_PRODUCTS.some(p=>p.kind==='subscription' && p.id===basePlanId),'Unknown subscription plan');
          assert(line.productId,'Missing product');
          assert(['PROCESSED','PENDING','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED','CANCELED'].includes(o.state),'Unknown state');
          assert(o.total && /^[A-Z]{3}$/.test(o.total.currencyCode || ''),'Missing original money');
          const amount=googleMoneyDecimal(o.total);assert(!amount.startsWith('-'),'Negative total');
          const paidAt=o.orderHistory?.processedEvent?.eventTime || o.createTime;
          assert(paidAt && Number.isFinite(Date.parse(paidAt)),'Missing order date');
          prepared.push({orderId:c.orderId,region:o.buyerAddress?.buyerCountry || null,
            amount,currency:o.total.currencyCode,...googleOrderDeductions(o,o.total.currencyCode),
            userId:c.userIds[0] || null,basePlanId,productId:line.productId,packageName,
            test:c.test,state:o.state,paidAt});
        } catch (error) { failures.push(error.response?.status || error.code || 'invalid_or_unavailable_order'); }
      }
    }));
    const summary = {knownOrders:candidates.length,alreadyPresent:candidates.length-missing.length,
      ready:prepared.length,testOrders:prepared.filter(r=>r.test).length,
      revenueKnown:prepared.filter(r=>r.developerRevenue !== null).length,
      taxKnown:prepared.filter(r=>r.taxAmount !== null).length,
      zeroRevenue:prepared.filter(r=>r.developerRevenue !== null && Number(r.developerRevenue)===0).length,
      missingOwners:prepared.filter(r=>r.userId===null).length,
      states:prepared.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}), failures};
    console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',...summary}));
    assert.equal(failures.length,0,'Incomplete Google retrieval; import was not applied');
    if (!process.argv.includes('--apply')) return;
    await db.query('BEGIN');
    try {
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query("SELECT pg_advisory_xact_lock(hashtext('subscription-payment-backfill'))");
      const inserted = await insertPrepared(db,prepared);
      const coverage = (await db.query(`SELECT count(*)::int AS count FROM payments WHERE "orderId"=ANY($1::varchar[])`,[candidates.map(c=>c.orderId)])).rows[0].count;
      assert.equal(coverage,candidates.length,'Missing persisted orders');
      assert.equal(await insertPrepared(db,prepared),0,'Repeat insert must not create duplicate orders');
      const duplicates = (await db.query('SELECT count(*)::int AS count FROM (SELECT "orderId" FROM payments WHERE "orderId" IS NOT NULL GROUP BY "orderId" HAVING count(*)>1) x')).rows[0].count;
      assert.equal(duplicates,0,'Duplicate orders');
      await db.query('COMMIT');
      console.log(JSON.stringify({committed:true,inserted,coveredOrders:coverage,duplicateOrders:duplicates,repeatedInsertCount:0}));
    } catch(error) {await db.query('ROLLBACK');throw error;}
  } finally {await db.end();}
}

module.exports = {insertPrepared};
if(require.main===module) main().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
