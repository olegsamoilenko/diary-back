const { google } = require('googleapis');

const PACKAGE_NAME = 'com.soniac12.nemory';

async function main() {
  const keyFile = process.argv[2];
  const purchaseToken = process.argv[3];

  if (!keyFile || !purchaseToken) {
    console.error(
      'Usage: node scripts/check-purchase-token.js <service-account-json-path> <purchase-token>',
    );
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const androidpublisher = google.androidpublisher({
    version: 'v3',
    auth,
  });

  const res = await androidpublisher.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  });

  const data = res.data;

  console.log('\n=== RAW GOOGLE RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));

  const expiryTimes = (data.lineItems || [])
    .map((item) => item.expiryTime)
    .filter(Boolean)
    .map((time) => new Date(time).getTime());

  const maxExpiryMs = expiryTimes.length ? Math.max(...expiryTimes) : null;
  const expiryTime = maxExpiryMs ? new Date(maxExpiryMs) : null;

  const hasAccess =
    expiryTime &&
    expiryTime.getTime() > Date.now() &&
    [
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_CANCELED',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    ].includes(data.subscriptionState);

  console.log('\n=== ANALYSIS ===');
  console.log({
    subscriptionState: data.subscriptionState,
    startTime: data.startTime,
    expiryTime: expiryTime ? expiryTime.toISOString() : null,
    latestOrderId: data.latestOrderId,
    linkedPurchaseToken: data.linkedPurchaseToken || null,
    isTestPurchase: Boolean(data.testPurchase),
    hasAccess: Boolean(hasAccess),
    autoRenewEnabled:
      data.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled ?? null,
  });
}

main().catch((err) => {
  console.error('\n=== GOOGLE API ERROR ===');
  console.error(
    JSON.stringify(err.response?.data || err.message || err, null, 2),
  );
  process.exit(1);
});
