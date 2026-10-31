# Community restriction sync — 30 October 2026

The authenticated `GET /forum/unread/summary` now includes `userRestriction` using the existing safe restriction projection (type, reason, startsAt, endsAt). Existing unread fields and the previous restriction endpoint remain compatible with released clients.

After a ban/unban is persisted, `CommunityGateway` sends `community_changed: { restrictionChanged: true }` only to the authenticated user's `community:user:<id>` room. This payload contains no reason, administrator or user data. Clients fetch the authoritative combined status. The front shares it across the community feed, topic and topic creation; reconnect and foreground/visible-screen refresh repair missed events, with a 30-second fallback only while community is active and online.

Deploy backend before distributing the updated frontend. No schema migration. Do not interpret automated coverage as deployed or phone acceptance.

Manual validation is tracked as **DEV-08-BAN** in `../diary-front/docs/audits/release-core-checklist-20261028.md`: ban with reason while community is open; inspect home/topic including keyboard/status-bar inset; lift ban without restarting and confirm posting returns. Existing server enforcement and permission to delete own content remain in place.

Validation: backend TypeScript noEmit passed; targeted Jest passed (community-status 5 tests; forum-publication-consumers 44 tests). Front focused suites passed, including reason rendering, status-bar inset, shared state, concurrent refresh/account switch, reconnect and foreground-only polling. Front ESLint has no errors; global front tsc remains blocked by TodayHabitProgressSummary.tsx:17 (HabitTypeConfig), outside this change. Phone acceptance and deployment remain pending.
