# Mechanism-focused responses — 3 October 2026

Approved after the Lite/Terra September14 audit and the explicit correction that explanations must be full, not brief. Three in-place replacements, no added mode-specific common blocks.

- Common psychological reasoning: facts as evidence, full mechanism/function/maintaining effect, feasible changes and observable results; advance beyond the user's own explanation. Grounded hypotheses remain free; uncertainty, authorship, ordinary factual answers and brief acknowledgments remain.
- Entry/check-in task: replaces reflection/meaning alternative with explanation of why a reaction may arise and what sustains/changes it.
- Daily task: explanatory synthesis with history rather than event recap. Other period tasks use the updated shared common block.
- Existing response-system builder and live entry/check-in/conversation/period consumers retained. No runtime/provider/billing/cache TTL, response-length, capability, capsule or user-data changes.

## Size

Actual tiktoken o200k_base: shared paragraph118→119; entry/check-in bullets46→43; daily task25→26; combined replacements189→188. Shared core including psychologist role1905→1906. Existing tests validate assembled common/service/style fixtures within2500, separately from local tasks and arbitrary user-provided aboutMe data.

## Verification

191 focused tests passed across response-system-prompt (40), shared-response-budget, live periodic prompt and periodic lifecycle (142). Only affected suites were repeated after assertion fixes; one pre-existing assertion still quoted older attribution wording and was aligned with the unchanged current rule. Scoped ESLint and diff whitespace checks passed. The rollback dry-run verified all five current files match after/ without writes. Jest required execution outside the sandbox because Windows realpath was denied even for a workspace temp directory. No paid API calls; application fresh/cache-read/cache-write/output tokens0, credits0. Codex turn token usage unavailable. Tests cannot establish actual Terra response quality; evaluate the next real seed.

## Rollback

before/ and after/ contain exact file bytes as .txt snapshots, with manifest.json and changes.patch. `rollback.py` checks all current source/test files match after/ before any restoration; default mode only checks. On an explicit rollback request, run with --apply from this repository. Later edits abort the whole restore. Restore documentation/decision notes separately. Do not reset the dirty worktree.

Updating a system prefix can require a cache refill for new requests; existing saved dialogue snapshots are not retroactively rewritten.
