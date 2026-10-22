# Entry creation metadata

Decision, 17 October 2026: extend the existing `POST /diary-statistics/add-entry-stat`
and `entries_stats`; no separate analytics module or admin API for this metadata.

- `plannerType`: `goal`, `habit`, `task`, `event`, or `null`. This is the association
  committed when creating the journal entry, not a planner title/ID or journal text.
  Subsequent editing of the association does not rewrite the creation snapshot.
- `hasAiAnalysis`: `false` at creation, `true` after the creation flow or its AI retry
  successfully persists an AI comment (including a retained partial response).
  AI enabled/requested alone is not evidence that an analysis exists.
- Historical rows and old clients without these fields stay `null`/unknown.
  Do not infer that historical null planner values prove an unlinked entry, or
  that historical null AI values mean no analysis.

The mobile save hook reports committed creation even with AI disabled. Both
creation and analysis-saved reports are fire-and-forget with caught errors;
neither the local save nor AI finalization waits for telemetry. Reports share
the existing AI cycle trace ID. The existing transaction/advisory lock serializes
them: the first creates the row, later reports promote `hasAiAnalysis` without
incrementing creation/activity counters. A delayed false cannot overwrite true.
Both messages include the captured creation planner type, so reverse arrival
order preserves the association. Other diary statistic kinds are unchanged.

This remains best-effort online telemetry. There is no offline outbox/backfill,
and these fields are not a live inventory of later journal edits/deletions.
Apply `AddEntryStatPlannerType1792216800000` before deploying the server change;
it adds nullable columns and a planner-type constraint without rewriting history.
The migration was applied to the local Docker PostgreSQL database on 17 October.
