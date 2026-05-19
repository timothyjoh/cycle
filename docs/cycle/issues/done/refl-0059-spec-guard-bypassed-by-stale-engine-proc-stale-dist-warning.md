---
id: refl-0059-spec-guard-bypassed-by-stale-engine-proc-stale-dist-warning
title: Emit engine.warning at engine.start when dist/cycle.js mtime is newer than process start
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:40:34.039Z"
source: triage
parent: refl-0059-spec-guard-bypassed-by-stale-engine-proc
---
## Problem

The engine is a long-lived loop that loads `dist/cycle.js` once at process start. Cycles that ship code improvements under `src/engine/` cannot consume those improvements until the engine is restarted — the loaded module graph is stale even after `pretest` rebuilds `dist/`.

Concrete incident: cycle 0058 shipped `SPEC_MIN_BYTES = 200` in `src/engine/run-cycle.ts` with a passing regression test. Cycle 0059 ran in the same engine process, generated a 116-byte `SPEC.md`, and the spec step still emitted `step.end status:"ok"` — the guard was compiled into `dist/` but not loaded into the running engine. Both REVIEW.md and PLAN.md §Risk Assessment noted the guard "did not fire here" without identifying the structural cause.

This is a short-term mitigation: surface the staleness to the operator so they know to restart. The deeper fix is tracked separately as `refl-0059-spec-guard-bypassed-by-stale-engine-proc-process-per-cycle`.

## Approach

At `engine.start`, compare `dist/cycle.js` mtime against the running process's start time (`process.uptime()` → derive start instant, or capture `Date.now()` at the top of `cli.ts` before any work). When `mtime > processStart`, emit one structured `engine.warning {reason: "stale_dist", dist_mtime, process_start, message}` event and continue. Non-fatal — the engine still runs with the stale module graph; the warning just makes the structural ceiling visible.

## Acceptance

- `engine.warning {reason: "stale_dist"}` event emitted exactly once at `engine.start` when `dist/cycle.js` mtime is strictly newer than captured process start instant.
- No warning emitted when `dist/cycle.js` mtime ≤ process start (the common case).
- Warning carries enough context (paths + timestamps) for an operator to confirm the gap without re-running `stat`.
- Regression test covers both branches via injected `fs.stat` / clock fakes.
- Coverage gates green (line ≥ 95%, branch ≥ 75%, func ≥ 90%; `triage.ts` floor unaffected).
