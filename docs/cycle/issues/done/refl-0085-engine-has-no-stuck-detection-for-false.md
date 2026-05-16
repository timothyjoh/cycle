---
id: refl-0085-engine-has-no-stuck-detection-for-false
title: Add consecutive-noop-cycles counter to halt engine on repeated false-positive-success cycles
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:30:29.953Z"
source: triage
---
## Problem

`max_consecutive_failures` counts only `cycle.end status:failed`. Cycles that end `status:ok` while making zero source-code changes are invisible to the halt counter. Cycles 0083–0085 all followed this path: `settings.local.json` blocked writes, Claude CLI exited 0, build exited 0, commit exited 0, engine saw a normally-draining queue. Three consecutive false-positive successes on the same deliverable were invisible to the halt policy.

## Relationship to refl-0083

`refl-0083-commit-trunk-sh-commits-artifact-only-ch` guards the commit path (exit 1 on artifact-only staged sets). That fix handles cycles that reach the commit step with no `src/` changes. This issue is complementary: if Claude CLI exits 0 and produces no commits at all (or only artifact commits), the engine still needs a pattern detector that counts ok-but-no-source cycles before halting. The two fixes are independent and both needed.

## Recommended fix: consecutive_noop_cycles counter (Option 2)

In `src/cli.ts`, alongside the existing `consecutive_failures` counter, add `consecutive_noop_cycles`:

- After `cycle.end status:ok`, run `git diff --name-only <base>...HEAD -- src/` where `<base>` is the resolved base branch from workflow config.
- If output is empty (zero `src/` files changed), increment `consecutive_noop_cycles` and emit `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}`.
- If at least one `src/` file changed, reset `consecutive_noop_cycles` to 0.
- When `consecutive_noop_cycles` reaches `engine.max_consecutive_failures` (same threshold, no new config key needed), emit `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}` and exit non-zero.
- Terminal failures (`cycle.end status:failed`) do not interact with `consecutive_noop_cycles`; the two counters are fully independent.
- On `engine.start`, log `consecutive_noop_cycles: 0` alongside `skip_completed_on_retry` for observability parity.

## Acceptance criteria

1. `consecutive_noop_cycles` increments on each `cycle.end ok` where `git diff --name-only <base>...HEAD -- src/` is empty.
2. Counter resets to 0 on any cycle that lands at least one `src/` file change.
3. At threshold, `engine.halted {reason: "max_consecutive_noop_cycles", threshold, noop_cycles}` emits and process exits non-zero.
4. Each noop cycle emits `cycle.warning {reason: "noop_cycle", cycle_id, source_files_changed: 0}` before the queue advances.
5. Unit test: N consecutive noop cycles (N = `max_consecutive_failures`) trip the halt; a cycle with ≥1 `src/` change resets the counter; failure cycles do not affect the noop counter.
6. `no_branch: true` workflow resolves `<base>` from `base_branch` config (not hardcoded `main`) — see `refl-0040-engine-base-branch-resolution-hardcodes` for the related fix.
7. `engine.start` log event includes `consecutive_noop_cycles: 0` for observability.
