---
id: refl-0260-fix-ts2339-typecheck-error-in-iteration
title: Fix TS2339 typecheck error in iteration-too-fast.test.ts
workflow: feature
depends_on: []
triaged_at: 2026-06-04T15:10:08.462Z
source: triage
priority: medium
---
`npm run typecheck` currently fails (repo-wide gate is red) with:

```
tests/cli/iteration-too-fast.test.ts(152,46): error TS2339: Property 'length' does not exist on type '{}'
```

on the line `assert.deepEqual(halts[0].failed_cycles?.length, 1, …)`.

CLAUDE.md requires `tsc --noEmit` to be clean ("no warnings allowed"); a red typecheck gate masks any new error a future cycle introduces in that file, so this must be repaired even though it is pre-existing.

## Root cause

The parsed `failed_cycles` log field is typed as `{}` at the read site in `tests/cli/iteration-too-fast.test.ts`, so `.length` does not narrow.

## Fix

Give the parsed event an explicit type so `failed_cycles` is an array — e.g. cast as `{ failed_cycles?: unknown[] }` (or assert the array shape) at the read site so `.length` is valid. Keep the assertion semantics identical; this is a typing-only change.

## Verification

- `npm run typecheck` must be clean (exit 0, no TS2339).
- `npm test` must still pass; the assertion behavior is unchanged.

## Scope / notes

- Confirmed pre-existing on clean `HEAD` (per origin cycle 0260 BUILD.md and REVIEW.md), so it is genuinely a follow-up, not a regression from that cycle.
- Distinct from `refl-0246` (a TS2345 error in `src/**`); this is a separate TS2339 in a test file. Do not conflate the two.
- REVIEW.md Finding 5 of cycle 0260 explicitly recommended filing this.
