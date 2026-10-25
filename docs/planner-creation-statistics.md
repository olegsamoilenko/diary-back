# Planner usage collection

Decision, 17 October 2026: collect two figures for each planner type: total user
Create actions and items still saved. Types: goal, habit, checklist, task, event,
reminder, note. Admin display was initially deferred; the user list was connected
on 22 October 2026 (see Admin user list below).
The user reports almost no historical statistics; start new collection at rollout,
without historical backfill or an inventory synchronization project.

## Storage and counting

PlannerStatisticsModule owns the existing planner_creation_stats table:
- user_id: authenticated owner, nullable FK with ON DELETE SET NULL.
- type and optional local entity_id: no titles, descriptions, notes or other content.
- created_at: server receipt time of a Create report; nullable for technical
  recurrence branches and deletions received before a Create report.
- deleted_at: first received deletion time, null while the item remains saved.

One recurring series is one item, not one item per occurrence. Editing a repeat
can create a separate persisted card: it contributes to saved inventory but is
not a new user Create action. Subtask/stage rows are not independent planners.
Archive, completion, pause and resume do not change either count. Deleting an
individual occurrence does not remove the series from inventory. Actual item /
whole-series deletion marks its row deleted and preserves creation history.

Reporting uses these definitions:

```sql
SELECT type,
       COUNT(created_at) AS created_total,
       COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_id IS NOT NULL) AS saved_now
FROM planner_creation_stats
GROUP BY type;
```

Account deletion anonymizes creation history and excludes that user's rows from
saved inventory. A received deletion with an unknown ID creates a tombstone with
no creation time: it invents neither a creation nor a saved item. A delayed Create
report can fill created_at but cannot clear deleted_at. Repeated reports with an
ID are idempotent through the unique owner/type/entity key. Saved-only technical
branches mean saved_now is not necessarily created_total minus deletions.

## Collection contract and compatibility

All three routes require the user's JWT:
- POST /planner-statistics/created: {type, entityId?}.
- POST /planner-statistics/saved: {type, entityId}, for technical branches.
- POST /planner-statistics/deleted: {type, entityId}, for actual deletion.

Responses preserve {recorded: boolean}. The server owns user ID and timestamps;
DTO validation strips unrelated input. Collection does not require a new admin route.

Existing POST /goals-statistics/add-goal-stat bridges goal/habit/checklist creates
to the common table. Live forms retain one creation call with the local ID;
legacy goals_stats and daily activity counters retain their previous behavior.
The old delete route accepts an optional entityId and marks that exact common
row deleted. Old clients without IDs match only the latest undeleted anonymous
row of their own type and owner, preserving their former approximate semantics;
they never delete an identified common row. Anonymous creations cannot be deduplicated.

Mobile deletion reports originate after committed deletion in shared services,
covering planner, Calendar, Today and search consumers. The old goal delete call
also includes its ID, so duplicate common-table reports are safe. Branch saves
are reported only after their transaction succeeds. Edits, validation failures
and failed writes do not submit new creation telemetry.

## Limits and rollout

Requests remain best-effort and do not block local actions or show analytics
errors. There is no offline queue, retry/reconciliation or inventory snapshot.
Thus saved_now means currently saved among received reports, not an exact census
of all devices: offline creates/deletes, imports and pre-rollout local items may
be missing or stale. Nearly empty history makes starting now reasonable, but does
not remove this delivery limitation. Creation frequency uses receipt time.

Deploy backend/schema before the updated mobile app. Migrations:
- 1792195200000-AddPlannerCreationStats.ts creates the table and unique/index keys.
- 1792195201000-AddPlannerDeletionStats.ts adds deleted_at and permits a null
  created_at without fabricating historical data. Its rollback discards rows
  without creation evidence before restoring the earlier non-null contract.

The current backend also has TypeORM synchronize:true; migrations use compatible
IF NOT EXISTS/ALTER statements. No production deployment or real PostgreSQL
migration execution was performed in this task.

## Local verification

Creation-only baseline: backend20 and frontend154 focused tests passed, plus
backend TypeScript and scoped lint. Lifecycle follow-up covers exact-ID deletion,
retained series, technical branches, failed writes, duplicate/out-of-order SQL
contracts, legacy compatibility and silent network failures. Repositories and
transport are mocked; these checks do not establish production delivery.

Lifecycle follow-up verification: backend33/33; frontend174 service/API tests
passed after correcting test mock cleanup, plus four goal/habit/checklist card
suites passed. Both repositories passed TypeScript, scoped ESLint and diff
checks. One additional broad DetailSheets suite could not load because of the
uuid ESM import through EntryReflection/ResponseImageGeneration; this unrelated
test setup was not changed and is not claimed as passing.

## Real app seed — 17 October 2026

Executed through the connected Android development app's real persistence and
form telemetry methods, with its API pointing to the local backend and storage
verified in Docker PostgreSQL. No direct SQL inserts or fabricated analytics.
Run ID: `qa-planner-stats-1792187400000`.

Created two of every type, then deleted one of every type through the existing
application services. All 14 creation requests and 10 deletion requests
(7 shared reports plus 3 legacy compatibility reports) succeeded. PostgreSQL
has exactly 2 creations, 1 saved item and 1 deleted item for EACH of the seven
types, with 2 distinct IDs each. Independent app reads confirm all 7 retained
objects exist and all 7 deleted objects are absent. The retained QA objects have
titles beginning `QA · Статистика` and remain available for inspection.

The run exposed a separate SQLite cache race: a background habit calculation
attempted to insert `goal_stats_cache` after its parent had been deleted. Its FK
failure was shown by the generic constraint toast as a duplicate-record error.
Fixed the shared cache repository to atomically skip absent parents, and publish
Redux cache results under the same write lock. A real-app regression invokes
the cache service with stale QA parent snapshots for goal/habit/checklist:
all three retained caches are present, all deleted caches remain absent in both
SQLite and Redux; no new cache errors were logged during that check. Focused
cache/habit-action regression suites pass (19 tests), including real SQLite with
foreign keys enabled. This is runtime/service verification, not manual UI acceptance.

Reusable runner and evidence: `diary-front/scripts/qa/run-planner-statistics.cjs`,
`planner-statistics.app.js`, and
`diary-front/docs/audits/planner-statistics-seed-20261017.md`.
This exercises the already running local schema; it does not establish production
deployment or a migration run on a pre-upgrade PostgreSQL database.

## Admin user list — 22 October 2026

The existing admin-JWT protected `GET /users/get-all` now adds
`plannerCreatedCounts: { goal, habit, checklist, task, event, reminder, note }`
to each returned user. Missing types are zero. A single grouped query over the
current page's user IDs counts non-null `created_at`; deleted creations remain
included, technical saved-only branches and deletion-only tombstones do not count.
Planner rows are not joined to payments/legacy goal rows, avoiding multiplication.
Existing diary counters, `goalsStats`, subscription mapping and pagination remain.

`diary-landing` `/admin/users-list` reuses `AllUsersTable` and its shared table
controls. It shows the four existing diary counters with explicit entry/checkin
dialog labels and all seven planner creation counts. An older server without the
new field displays an em dash, not invented zeroes or legacy goal totals.
The acquisition chart counts any diary/dialog or planner creation as activity;
legacy goal rows still prove historical activity but never populate the new
creation counters. The chart explicitly describes its current-page scope.

These are received creation reports, not a current device inventory. Existing
offline/history limitations apply. No migration, collection change, backfill,
production deployment or data mutation is part of this admin change.

Validation: 81 tests across user creation counts, UsersService and planner
statistics passed; backend and landing TypeScript passed; scoped ESLint has no
errors (landing retains the existing useEffect dependency warning). Landing
activity classification passed 16 assertions; SSR verified 24 aligned columns,
explicit labels and unavailable-server placeholders. Query repositories are
mocked in these tests; a live database/API and browser walkthrough were not run.
Next step: deploy both backend and landing, then verify the admin page against
received statistics. Task usage ledger: exact fresh-input, cached-input and
output token counts were unavailable; no API-equivalent cost or quota estimate
is asserted.

## Admin V2 and explicit check-in analysis — 22 October 2026

The separate `/users/admin-new-users` and `/users/admin-new-users/days` routes
filter a registration cohort by inclusive Kyiv calendar dates. Page size defaults
to 200 and accepts arbitrary positive integers. The daily graph uses EXISTS
across creation sources for the full cohort; table page changes cannot change it.
`/users/admin-details/:id` lazily loads sanitized details, payments and purchased
credit summary through the shared wallet service. All routes require admin JWT.

V2 adds `entriesAnalysis` and `checkinsAnalysis` with independent `withAnalysis`,
`withoutAnalysis`, `unknown` counts from `hasAiAnalysis` true/false/null. Queries
aggregate in PostgreSQL without hydrating activity arrays. Existing total counts
and V1 contracts remain available.

Migration `1792670400000-AddCheckinStatAnalysis` adds nullable check-in analysis
evidence, matching entries. Old rows are not backfilled from tokens: expenditure
does not prove saved analysis. Updated mobile creation reports false, then the
shared check-in response service reports true after a complete AI comment is
successfully saved. The existing trace lock/dedup path updates the same row;
late false reports cannot downgrade true. Missing legacy traces are not reported
again as new creations. This telemetry retains existing delivery limitations;
it is not an authoritative inventory of local device content.

Deploy schema/backend before the updated mobile client. Local dev uses existing
TypeORM synchronize; the migration is idempotent after synchronization. No
production deployment or production migration has been performed in this task.
