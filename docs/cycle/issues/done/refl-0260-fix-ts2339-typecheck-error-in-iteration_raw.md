---
id: refl-0260-fix-ts2339-typecheck-error-in-iteration
source: reflection
title: fix-ts2339-typecheck-error-in-iteration-too-fast-test
added_at: 2026-06-04T15:05:32.890Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0260"
---

`npm run typecheck` reports `tests/cli/iteration-too-fast.test.ts(152,46): error TS2339: Property 'length' does not exist on type '{}'` on `assert.deepEqual(halts[0].failed_cycles?.length, 1, …)`. BUILD.md and REVIEW.md both confirm this reproduces on clean `HEAD` with this cycle's change stashed, so it is pre-existing and out of this cycle's scope — but it means the repo-wide typecheck gate (CLAUDE.md: "no warnings allowed") is currently red, which masks any new error a future cycle introduces in that file.

The `failed_cycles` log field is typed as `{}` at the read site, so `.length` fails to narrow. Fix by typing/casting the parsed event (e.g. an explicit `as { failed_cycles?: unknown[] }` or asserting the array shape) so `tsc --noEmit` is clean again. This is distinct from the already-filed `refl-0246` (a TS2345 error in `src/**`); this one is a separate TS2339 in a test file. REVIEW.md Finding 5 explicitly recommends filing this follow-up.
