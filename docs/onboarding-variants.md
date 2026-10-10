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
