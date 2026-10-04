# Yearly analysis and report UI — 30 September 2026

User explicitly approved the complete yearly flow. Live reference: `diary-front/app/periodic-analysis.tsx`, its shared PeriodicAnalysisContent, EntryConversation and ChatInput. No parallel screen or provider path.

## Contract

- Kind year travels through the shared route, DTOs, period validation, snapshot, estimate, generation, local storage and dialogs. Full Jan1–Dec31 calendar years, including leap years; existing future-date/ownership checks remain.
- Today offers year on December31. Saved calendar cards sort day/week/month/year. Existing month uses the same page. All main reports render full width without avatar; dialog answers and loaders retain it.
- Device selects the newest usable completed monthly capsule per month for owner, timezone and year, known by request time. December reports generated in January remain eligible. No raw yearly entry/planner scan.
- Server canonicalizes up to12 full-month capsules, strips unrelated raw fields, sorts dates and rejects duplicates, invalid bounds/timezone, future revisions and empty evidence before paid execution. Missing months are explicit; older yearly capsules are comparison only.
- Year prompt covers changes and plausible mechanisms with attribution. Missing months are unknown; metrics describe source moments. Existing day/week/month response instructions remain unchanged.
- Year uses the selected main model via AiService.executeResponse. Compact continuity capsule returns jointly with the answer, following current month flow: text5000 characters, capsule1800 characters, nominal output3400 tokens subject to existing provider policy. No extra Luna yearly request. Usage is yearly_analysis; dialogs remain dialog. Shared claims, guards, cancellation and local pending state remain. No new backend content persistence or migration.
- Period input ceilings remain disabled for audit. Diagnostics include coverage, missing months and token counts.

## Verification and limits

62 frontend tests across UI/periods/repository/snapshot/service/stream/recovery/context;66 backend periodic/provider/capsule tests passed. Covers12-month completeness, leap boundaries, missing months, invalid evidence before billing, estimate/generation identity, yearly billing and local dialogs. Frontend TypeScript and scoped ESLint passed; backend scoped ESLint passed. Backend full TypeScript still reports pre-existing TS2589 at src/ai/media/image-generation.service.ts:109. Diff whitespace checks passed.

No paid AI request, deployment, Metro restart or data mutation. Fresh phone capture showed Calendar September14, not changed report states; native visual acceptance and live annual quality remain unverified. Exact Codex fresh/cached/output counters unavailable; no quota/API estimate substituted.

Next: verify weekly width and calendar order on phone, then resume September14 seed audit. Approved monthly context rewrite (overlapping weeks plus uncovered daily tail) remains separate and pending.
