---
id: refl-0048-sync-state-prior-entry-preservation-acro
title: Pin `.sync-state.json` prior-entry preservation across skipped divergent paths
workflow: feature
depends_on: [refl-0048-plan-vs-impl-drift-on-conditional-state]
triaged_at: "2026-05-14T17:26:16.406Z"
source: triage
---
## Context

SPEC for cycle 0048 (sync-defaults divergence guard) declares: *"Skipped paths' prior entries (if any) are left untouched."* The implementation in `scripts/sync-defaults.mjs` honors this today — `state[to]` is only written on a successful copy, never on the skip path. But `tests/defaults/sync-defaults-guard.test.ts` does not pin the invariant directly.

The existing test `state recording omits skipped paths` (around line 151) only covers the *first-time skip with an empty starting state* case — it asserts the divergent entry is absent after the run, which is also satisfied by the (broken) behavior of "clear state[to] on skip" or "never write state[to] at all." Neither weaker behavior would catch a refactor that re-keys state on every run.

## Why it matters

This is the invariant that makes the guard *self-correcting across re-runs*:

1. Operator force-syncs a divergent path (`--force`): state records new `src_sha256` + `dst_sha256`.
2. Operator immediately re-diverges the destination locally.
3. Next `sync-defaults` run must still recognize the path as divergent based on the recorded `dst_sha256`.

If step 1's recorded entry is wiped (or never persisted) by an unrelated skip on a later run, step 3 silently re-clobbers. The 0046 incident this whole feature was built to prevent.

## Acceptance

- Extend `state recording omits skipped paths` (or add a sibling test) in `tests/defaults/sync-defaults-guard.test.ts` to:
  1. Seed `.cycle/.sync-state.json` with a placeholder entry for the divergent destination path (e.g. `{ ".cycle/workflows.yml": { src_sha256: "deadbeef…", dst_sha256: "cafebabe…", synced_at: "<iso>" } }`).
  2. Run `node scripts/sync-defaults.mjs` against a fixture where that path is divergent (so it gets skipped).
  3. Assert exit code `2` (skip path triggered).
  4. Read `.cycle/.sync-state.json` after the run.
  5. Assert the placeholder entry for the divergent path is **byte-identical** to the seed (deep-equal on the parsed object is acceptable; ideally also `JSON.stringify` byte compare to catch key-order or whitespace drift if the writer ever reformats).
- Other non-divergent state entries on disk should also survive untouched (existing coverage already implies this, but adding an extra non-divergent entry to the seed makes the assertion more robust).
- ~10 added lines, no production-code changes expected.

## Out of scope

- Resolving the PLAN-vs-impl drift on the conditional state write itself — that is [[refl-0048-plan-vs-impl-drift-on-conditional-state]], which this depends on so the test pins the *agreed* contract rather than the current accidental behavior.
- Coverage instrumentation for `scripts/**` — separate item [[refl-0048-sync-defaults-guard-logic-sits-in-covera]].

## Notes

Generated from `refl-0048-sync-state-prior-entry-preservation-acro` (cycle 0048 reflection). Origin priority hint: 3.
