# Onboarding variants and first-exposure attribution

`GET /onboarding/config` keeps schemaVersion 1. Set `ONBOARDING_WELCOME_VARIANT` to one of:

| Value | Current client |
|---|---|
| pastel-refined | Shared centered name screen, four story slides, appearance, first entry |
| quick-start | Same name screen, appearance, first entry |

As of 1 November 2026 these are the only selectable variants. Both use the accepted pastel name layout without the decorative spot or book. Missing, invalid or retired server configuration falls back to pastel-refined. SchemaVersion remains 1, and both supported values are understood by the previous client. `ONBOARDING_WELCOME_CAMPAIGN` remains an optional log label; it is not the immutable account attribution.

`user_settings.onboardingVariant` is nullable and returned with normal settings. It records historical first exposure, so the authenticated existing `POST /users/update-settings` still accepts the two retired IDs from older clients and pending offline claims. They are no longer selectable UI variants. An owner-scoped conditional update sets it only when null, including concurrent claims. Null/omission cannot erase a known value. Ordinary settings saves must omit this column so a stale entity does not undo a concurrent claim.

The client captures an actual name/Welcome exposure before completion. Its account-scoped pending value survives offline completion and retries on a later boot/event. A replay of already completed onboarding never backfills an unknown old account. Production keeps supported assignments pinned. On the new client, legacy server responses, stored assignments and account cohorts resolve journal-collage to pastel-refined and direct-entry to quick-start; historical attribution is not rewritten. Stored UI assignments migrate in place. Preview can display another flow without changing attribution. Completion flags and existing PIN/biometry checks are unchanged.

Deploy backend before testing new client attribution. `AddOnboardingVariant1791763200000` adds the nullable column with no historical backfill, and also tolerates an already synchronized schema. The application currently uses TypeORM synchronize; environments with synchronize disabled must run the normal migration pipeline. No production deployment or migration was performed by the assistant.

For counts, unknown remains a separate group:

```sql
SELECT "onboardingVariant", COUNT(*)
FROM user_settings
GROUP BY "onboardingVariant";
```

This measures the recorded onboarding entry cohort, not onboarding completion or conversion. Those still require the existing onboarding events.

## Two-variant handoff — 1 November 2026

The shared name composition lives in `diary-front/components/auth/AuthGate.tsx`; full-story routing and the appearance step remain in `Welcome.tsx` and `QuickStartOnboarding.tsx`. Retired collage rendering and direct-entry auto-completion were removed. `welcomeVariant.ts` normalizes legacy UI assignments; historical settings and queued attribution remain compatible. The local backend environment already selects quick-start and was not changed.

Validation: 67 focused frontend tests and 7 backend config/controller tests passed. They cover both supported flows, legacy assignment migration, pinned/preview behavior, queued attribution, appearance persistence/retry and completion. Frontend scoped ESLint and both repositories' diff checks passed. Full frontend TypeScript reports unrelated errors in `ViewTopic.tsx:2171` and `TodayHabitProgressSummary.tsx:17`. The additional `firstLaunchIntegration` suite could not start because Jest does not transform uuid's ESM export; its assertions were not executed. No production deployment, account-data reset or app restart was performed. A single phone capture showed the Android launcher, so the new quick-start name screen still needs visual confirmation. Exact fresh/cached/output token counts are unavailable.

## Historical handoff — 8 October (superseded by the current two-variant contract above)

# Server-controlled Welcome variants — 8 October 2026

The user requested keeping both the approved paper collage and the retained illustrated-book design, switching periods from the backend and comparing completion. This is a manual rollout, not randomized A/B allocation or an automatic weekly schedule.

## Configuration

Use the existing environment-based rollout convention (also used by advertising). No database migration or new user settings are required.

```dotenv
ONBOARDING_WELCOME_VARIANT=pastel-refined
ONBOARDING_WELCOME_CAMPAIGN=book-20261008
```

- `pastel-refined`: green field, illustrated open book with lavender ribbon. Restored existing branch, not a redesign.
- `journal-collage`: paper, tape and connecting lines; retained current design and safe default.
- Campaign: a period label, 1–64 ASCII letters/digits/hyphens/underscores. Change it with each comparison period, e.g. `paper-20261015`.
- Apply changed environment through the normal backend process restart/deployment. Every replica must have the same values. No client rebuild is needed for later switches once the variant-capable client has shipped.

Public `GET /onboarding/config` returns only `{schemaVersion:1, variant, campaign}`, with `Cache-Control: no-store`. It is public because the name screen can precede authentication. Unknown/missing variant falls back to collage; invalid campaign falls back to `welcome-v1`. Existing endpoints and older clients are unaffected.

Local activation was explicitly requested: `diary-back/.env` now selects `pastel-refined`, campaign `book-20261008`. Direct HTTP checks against both localhost and the phone's configured LAN endpoint returned this value with status200. This is local activation, not evidence of a production deployment.

## Client and measurement

Root boot fetches alongside existing startup work with a 1500ms overall timeout per attempt. The shared API client treats GET `/onboarding/config` as public: no secure-storage/authentication wait or session refresh/recovery. Before AuthGate renders, `initializeWelcomeVariant` resolves the choice; if the speculative request failed or returned invalid config, it retries once after boot (another bounded 1500ms) before choosing fallback. A production assignment is stored per user in AsyncStorage and survives restart/server switches; both name and Welcome use it. Existing onboarding completion flags remain authoritative, so changing the server does not replay completed onboarding. Preview/dev reloads read the latest server choice without overwriting production assignment and print `NEMORY_WELCOME_CONFIG` with the chosen variant/source. Missing endpoint, offline/invalid response after both attempts uses collage; this fallback is also pinned for the production user. Unavailable storage still keeps the current process consistent, but cannot guarantee consistency across relaunches.

All existing `onboarding_*` events include `welcomeVariant`, `welcomeCampaign`, `welcomeConfigSource`, and `welcomeAssignedAt`. Filter by actual viewed events (name or story), count unique users, and compare appearance completion / first-entry saved and the last received stage. Separate development/test traffic and fallback assignments. Older clients lack these fields and must remain a separate cohort. Existing transport limitations (offline events, process death before delivery) still apply. Sequential weeks may differ in acquisition mix; a completion difference alone does not establish causality.

References: front `utils/onboarding/welcomeVariant.ts`, `visualTrial.ts`, root layout, live AuthGate/Welcome/WelcomeConnections/NemoryBrandBackdrop, existing `logging/onboarding.ts`. Drawings were retained in `docs/design-history/20261006-onboarding-variants/` on the frontend; shared typography, navigation, recent performance fixes and first-entry behavior remain current.

## Verification

Backend config/controller3 tests pass. Front assignment/API/logging tests pass; full focused batch32pass/2fail contains only the previously known Welcome typography expectations before the approved +2 baseline. Additional actual Welcome rendering tests pass for both variants, plus held Next regression (3/3). Front TypeScript and scoped lint pass. Backend scoped lint and final diff checks recorded in the task handoff. Phone inspection found Today; no reload, name input, preference reset, save or purchase was performed. The restored design's current native rendering remains pending a dev reload. Exact fresh/cached/output token counters unavailable; no cost estimated.
