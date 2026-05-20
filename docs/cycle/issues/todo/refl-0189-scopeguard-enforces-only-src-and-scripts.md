---
id: refl-0189-scopeguard-enforces-only-src-and-scripts
title: "scopeGuard: audit intended boundary semantics and lock in with an explicit test"
workflow: feature
depends_on: []
triaged_at: "2026-05-20T01:39:11.777Z"
source: triage
---
## Background

The `scopeGuard` function at `src/engine/commit-cycle.ts:79` only flags dirty files prefixed with `src/` or `scripts/`. Files under `docs/`, `tests/`, or project-root config paths are silently passed through — no `scope_violation` is emitted for them.

This was surfaced during cycle 0189: four pre-existing `commit-cycle.test.ts` tests used `README.md` as the dirty file to trigger a scope violation. The implementation never blocks `README.md`, so the tests were corrected to use `src/bar.ts`. That fix made the tests accurate but left the underlying semantic question unresolved.

## Decision Required

Read `scopeGuard` and its git history to determine which semantic is intended, then implement accordingly:

**Option A — Narrow guard (current behavior is intentional):** Only `src/` and `scripts/` are guarded; agents may write freely to `docs/`, `tests/`, and config files. Action: add an explicit comment in `scopeGuard` stating this boundary, and add a test asserting that a dirty `docs/README.md` does NOT trigger `scope_violation`.

**Option B — Broad guard (current behavior is a bug):** Any file the agent touches that was not listed in BUILD.md should be rejected. Action: replace the path-prefix filter with a check against the full touched-files list, and add a test asserting that a `docs/README.md` absent from the touched list triggers `scope_violation`.

## Acceptance Criteria

- [ ] Read `src/engine/commit-cycle.ts` `scopeGuard` and its callers; check git log for intent signals around the `src/` + `scripts/` prefix filter.
- [ ] Choose Option A or Option B based on evidence and implement it.
- [ ] Add a new test that explicitly asserts the boundary: either `docs/README.md` is NOT a violation (Option A) or IS a violation when absent from the touched list (Option B).
- [ ] Add a one-line comment inside `scopeGuard` stating which semantic is intentional.
- [ ] `npm run test:coverage` passes with no regressions.
- [ ] `npm run check:invariants` passes.
- [ ] If Option B, update ENGINE.md commit-scope-guard section to reflect the broader guard.
