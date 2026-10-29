# Purchase finance and Admin V2

Latest user decision, 2026-10-28: persist actual Google developer revenue for credit purchases AND subscription payments; calculate a labeled display estimate only when actual revenue is absent. This supersedes the temporary request to drop revenue. The unshipped drop migration was removed.

## Persistence and lifecycle

`credit_purchases`: `amount`, `currency`, `developerRevenue`, `taxAmount`, `financialDetailsPending`, `financialDetailsLastAttemptAt`. Money uses nullable numeric(30,9), decimal strings. All amounts share buyer currency. NULL means unknown; a returned zero is preserved. Tax amount enables country-specific fallback without guessing rates from currency or user profile country.

Existing manually populated credits remain pending=false and untouched. New purchases synchronize Orders after the existing grant/consume flow, both client and RTDN. Failures do not reverse credits or fail the purchase. The ten-minute job retries at most 50 pending rows; it waits for developer revenue, including a valid zero. Disabling pending prevents an in-flight response from overwriting manual data. No historical credit backfill runs.

Subscription revenue belongs to each payment/renewal in existing `payments`, not the changing `store_subscriptions` snapshot. It adds the same revenue/tax/retry fields, product/base-plan/package snapshots, test flag and order state. V2 purchase, Pub/Sub recovery/update and reconciliation register each order inside the existing transaction, keyed by unique orderId. No Google request runs while granting access. Legacy IAP payments also set pending=true. The minute scheduler selects at most 50 eligible payments, four requests at once, with five-second timeout and ten-minute retry spacing. Actual processed time replaces provisional registration time. Order ID/product checks precede persistence; no buyer addresses/tokens are logged.

Deploy both additive migrations: `1793206800000-AddCreditPurchaseFinancialDetails` and `1793211600000-AddPaymentRevenueAndTax`. Local columns applied; manual amounts preserved. Current AppModule also enables TypeORM synchronization; this is not production deployment evidence. Revenue migration rollback refuses to make unknown pending amounts zero and retains expanded decimal precision.

## Revenue and gross fallback

Actual `developerRevenueInBuyerCurrency` wins. Otherwise estimate `(actual amount - actual order tax) * (1 - feePercent / 100)`. For tax-inclusive 120 and tax 20, a 15% fee gives 85. Missing tax is never zero; test/refunded orders do not receive formula estimates. Estimates are display-only, exposed via `netEstimatedCount` and approximately markers.

Auto-renewal Play Billing fallback is 15%, an estimate rather than an account-specific verified deduction. Credit fallback is disabled until `GOOGLE_PLAY_CREDIT_FEE_PERCENT` is explicitly configured from verified evidence. User first suggested 15% for both, then retracted certainty and requested checking. Read-only local verification found 16/16 credit purchases and 43/43 known subscription orders are tests: no real payment supports inferring the account's credit fee. Google's current fee table varies with region/program/install history; don't infer programme enrollment from test revenue zero or assume all countries share VAT 20%.

Missing gross uses labeled USD catalogue estimates, never persisted as receipts. Active US prices read 2026-10-28: credits 5000=2.49, 20000=8.99, 40000=15.99; plans AdFree monthly=2.49, yearly=17.99, Lite=5.99, Base=11.99, Pro=23.99. These are current regional reference prices, not historical realized prices.

## Report

`GET /finance-statistics/admin-revenue` is admin-jwt protected. Kyiv dates, from/to inclusive, day/week/month/quarter/year; UI defaults last 30 days/day. Eight product summaries and stacked count/gross charts; net requires all included receipts to be covered. Historical currency conversion uses payment day through existing FxRatesService (OXR configured, otherwise official NBU cross rates). FX failures retain counts and disclose incomplete money totals. Partial-period tooltips show clipped bounds. Tests toggle defaults on in development.

Known subscription order IDs come from stored payments/subscriptions/success audit events. Deduplicate by order ID, count renewals separately, exclude full refunds and canceled/pending orders. Partial refunds affect actual income; gross charts show initial user payment. Historical completeness depends on retained order IDs. Bounded read-only Google lookups disclose unavailable receipts/date estimates/unknown products. Financial GET never writes data. Developer income taxes after payout are not calculated.

References:
- https://developers.google.com/android-publisher/api-ref/rest/v3/orders
- https://support.google.com/googleplay/android-developer/answer/112622?hl=en
- https://bank.gov.ua/admin_uploads/article/Instr_API_KURS_VAL_Full_eng.pdf

## Verification

57 focused finance/credit Jest cases passed after revenue restoration. Isolated PostgreSQL verified idempotent migrations, preserved manual amounts, per-order deduplication, separate renewals, precision and rollback guard. Live local report before restoration: 12 test payments / USD71.75, identical in all five groups; excluding tests zero. Authenticated browser confirmed monthly data. Final type/lint/regression and visual checks recorded in admin-v2.md when completed. No real purchase, Play programme enrollment check or production deployment occurred.

Usage ledger: fresh input, cached input and output counts unavailable. No API-equivalent cost or account quota estimate asserted.

## Authorized historical subscription import — 2026-10-28

User explicitly requested importing old subscription payments, including tests,
without duplicate orders, using actual Google revenue where available.
`scripts/backfill-subscription-payments.cjs` is local-only (127.0.0.1:5432), dry-run
by default; `--apply` commits one transaction after all Google requests validate.
It reuses the report's known-order selection and exact Money/deduction helpers,
resolves unambiguous existing user IDs, and uses ON CONFLICT(orderId) DO NOTHING.
Existing payment rows are never overwritten. No AppModule startup, subscription
activation, wallet grant, consume or refund operation occurs. Google lookup is
bounded to four requests/5s each; unavailable/conflicting data aborts before writes.
The current candidate cap is 2000 and exceeding it aborts rather than truncates.

Local execution: dry-run found43 unique retained subscription orders, all tests,
all PROCESSED, all with matching users and actual gross/tax/net. Additional
oldOrderId values in the audit journal introduced no missing orders. Committed43
payments;43 actual revenue and tax fields populated, pending0. Google's returned
net revenue is zero for all43 test orders; no estimated revenue was persisted.
Repeat insert inside the transaction inserted0; duplicate order count0.
Credit purchases were unchanged, verified by a before/after row-content checksum.
Historical completeness still depends on retained order IDs; no remote database
or production deployment was changed. Script syntax check passed.
