# E03.1 — event recurrence and actionable clarification

The live main response incorrectly claimed monthly events on day 31 skip February. No event or creation receipt was found during the preceding read-only phone inspection. The app already clamps absent month days and retains the original anchor. This change aligns instructions with that existing behavior; it does not change recurrence storage, UI, or current planners.

## Instruction replacements

`src/ai/utils/nemory-capabilities.ts`, V2 branch only:

- `Exact UI labels. Relevant planner/entry suggestions:no pressure/duplicates.` → `Exact UI labels;planner/entry suggestions:no pressure/duplicates.`
- `Create:current request/acceptance only;quotes/advice/hypotheticals/history≠consent;app confirms. Other actions:manual guidance only,no replacements.` → `Create:current request/acceptance;quotes/advice/hypotheticals/history≠consent;app confirms. Otherwise manual;no replacements.`
- `event location/important/multiple alerts` → `event location/important/alerts,month/year:min(anchor day,month-end)`.
- `clarify essentials/conflicts/unsupported,not defaults` → `Clarify essentials/conflicts/unsupported only:one question+reply here;wait,no success claim.`
- Technical wording only: `Fields:task/event/reminder dates/times` → `task/event/reminder:dates/times`; `one alert` → `1alert`; `goal dates+dated stages+alerts` → `goal/stage dates+alerts`; `day/week norm` → `day/week target`; `formatting` → `format`; `all color/icon` → `color/icon`; `Keep settings;period counts≠dates` → `Keep settings/period counts≠dates`. The prohibition on invented dates/links/media remains.

`src/ai/utils/planner-creation-instructions-v2.ts`:

- Question contract: `one specific question explaining the missing/conflicting parameter, in the user response language, <=1000 characters` → `one direct plain-language question explaining what is needed, explicitly asking the user to reply here to continue, in the user response language, <=1000 characters`.
- Event contract: `Convert requested duration to endDate/endTime, preserving midnight crossings. No category.` → `Convert duration to endDate/endTime, preserving midnight crossings. Monthly/yearly: missing day clamps to month-end; retain original day for later repeats. One series, no extra events or clarification for this supported rule. No category.`

No psychological/usefulness/practical-step instruction, legacy planner schema, feature gate, billing lifecycle, or frontend runtime code is changed. Weekly interval capability substitution is retained.

## Automated evidence

- Main instructions: `prompt-compaction.spec.ts`, 36 mode/locale combinations plus legacy/provider checks, o200k_base. Maximum **2997** tokens, including existing reserve for creation markers. Ukrainian entry2950, check-in2997, dialog2801, check-in dialog2832, conversation2616, daily summary2769, weekly2800, monthly2772, yearly2825. This is the tested instruction envelope, not a limit on user history/media/the entire API request.
- Luna planner instruction block:1348 tokens;1367 with weekly-event intervals. This is not its full extraction request.
- Psychology protection uses the existing verbatim/hash baseline.
- `planner-event-clarification.spec.ts`: actual actions/assistant/dialog extraction adapters with mocked provider output; checks prompt delivery, a single monthly series, yearly leap dates, and preservation of a direct clarification question. This does not prove live model compliance.
- Frontend `monthEndSeries.test.js` and `futureEventsService.test.js`:37 tests passed. Synthetic monthly series yields Jan31/Feb28/Mar31 with no April; previous-day18:00 alerts retain local civil time across DST. Yearly Feb29 returns to Feb29 in the next leap year.
- Final relevant results:55 backend tests and37 frontend tests passed (92 unique tests); backend TypeScript passed; new adapter-test ESLint passed; scoped diff whitespace check passed. The first budget trial exceeded the cap by3 tokens and was compacted; final matrix passes. The initial dialog test assumed string content, corrected to support the actual content-block envelope; all10 adapter tests now pass.

Manual acceptance remains **E03.1 pending retry;27/63 passed,36 remaining**. Do not choose either alternative from the previous incorrect answer. No existing event/habit/entry was mutated and no paid AI request was made (fresh/cached/output tokens0;credits0).
