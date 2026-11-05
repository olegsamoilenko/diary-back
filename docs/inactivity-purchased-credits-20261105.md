# Inactivity cleanup: purchased-credit protection — 2026-11-05

Accepted decision: preserve an inactive account while its existing purchased-credit wallet has any positive balance, even below the AI request minimum. Do not send an inactivity-deletion warning for that account. No new storage, pricing or credit-expiry rule.

## Implementation

- Live owner: `InactivityCleanupModule` -> `InactivityCleanupCronService`; the unused `inactivity-cleanup.service2.ts` is not the runtime reference.
- Both candidate queries join `CreditWallet` and exclude positive balances. Warning delivery rechecks the current wallet after selecting candidates.
- Final deletion uses `UsersService.deleteUserIfEligible`: a transaction locks the user, rechecks activity, locks plan state, then wallet, and skips deletion for a positive balance or protected subscription. Credit purchase grants already lock the user before plan/wallet, so a committed top-up cannot slip between eligibility and deletion; if deletion wins the lock, a later grant finds no user rather than granting and immediately losing credits.
- Reuse the existing shared deletion sequence. Its six cleanup services now accept an optional transaction manager, and settings/user deletion uses that manager too. Exceptions abort the transaction; success email follows commit. Existing paid-plan audit notifications retain their best-effort behavior.
- Explicit account/admin deletion keeps its existing contract and is not blocked by a wallet balance. Missing, zero and negative wallets retain existing inactivity eligibility. Warning/deletion thresholds remain 150/180 days.
- No migration, frontend change, production mutation, email delivery or deployment performed.

## Verification

Focused regressions cover positive balance (including 1 credit), missing/zero/negative balance, top-up after candidate selection, activity/paid-plan changes before locked recheck, lookup failure, deletion failure and explicit deletion. Repository/transaction behavior is mocked; this is not a live PostgreSQL concurrency test.

Validation: 69 tests passed across six suites (three inactivity suites, plans, credit purchases, and HTTP account-deletion access); `npm run typecheck`, scoped ESLint and diff whitespace checks passed. The initial Jest run could not write its system-temp cache; using `.tmp/jest-inactivity-credits` resolved that. The 23 HTTP tests initially hit sandbox loopback EACCES and passed on an approved rerun. No failed behavior assertions remain. Existing unrelated working-tree changes were left intact.

## Follow-up for legal copy

Terms/Privacy update is still separate. Existing Privacy says 90 inactive days, while runtime uses 180. Reflect the purchased-balance protection after backend deployment. AI quality monitoring is distinct from journal synchronization: current capture records have no account identifier, sampling is every configured N-th invocation (not random), and daily cleanup removes records older than 7 days. Actual production sampling configuration was not inspected; daily cleanup is not an exact seven-day maximum. Text itself may contain identifying information supplied by its author.
