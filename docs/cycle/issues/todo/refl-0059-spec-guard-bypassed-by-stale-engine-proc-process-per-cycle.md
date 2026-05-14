---
id: refl-0059-spec-guard-bypassed-by-stale-engine-proc-process-per-cycle
title: Spawn a fresh `node dist/cycle.js` subprocess per cycle so engine improvements take effect on the next cycle
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:40:34.039Z"
source: triage
parent: refl-0059-spec-guard-bypassed-by-stale-engine-proc
---
## Problem

The engine loads `dist/cycle.js` once at process start. Every infrastructure cycle that improves `src/engine/` has its first beneficiary be the *next engine invocation*, not the next cycle in the queue. This is a structural ceiling on the dogfood self-improvement loop — exposed by cycle 0058's `SPEC_MIN_BYTES` guard not firing on cycle 0059's 116-byte SPEC.md in the same process.

A stale-dist warning (separate child) surfaces the gap, but only restart actually closes it. The cleanest closure is process-per-cycle: the outer loop spawns a fresh `node dist/cycle.js run-one` per cycle, so every cycle gets the freshly built module graph automatically.

## Approach

Split the engine into two layers:

1. **Outer supervisor** (long-lived process). Owns the triage → pop → drain loop, `tbd.jsonl` queue authority, `engine.start` / `engine.stop` / `engine.halted` lifecycle, and `consecutive_failures` counter. Reads the popped todo row, then spawns the inner runner.
2. **Inner runner** (one short-lived process per cycle). Executes `runCycle` for a single id. Emits `cycle.start` / step events / `cycle.end` to its own stdout (or via the shared `.cycle/log.jsonl` writer with file-locked appends). Exits non-zero on terminal cycle failure; the supervisor reads exit code + tail to drive `terminalDrain` / `retryDrain`.

Cost: ~1s cold start per cycle (Node startup + esbuild bundle import). Worth it — eliminates the entire "engine ran the wrong code" failure class.

This can ship after or in parallel with `refl-0059-spec-guard-bypassed-by-stale-engine-proc-stale-dist-warning`; the warning is short-term mitigation, this is the real fix and supersedes it.

## Acceptance

- Outer supervisor spawns `node dist/cycle.js <inner-mode> <cycle-args>` (array args, no shell) per cycle pop and waits for exit.
- Inner runner exits 0 on `cycle.end status:"ok"`, non-zero on terminal failure; supervisor maps exit code to existing `terminalDrain` / `retryDrain` branches.
- `.cycle/log.jsonl` remains a single append-only stream across supervisor + inner processes (lock-protected or single-writer via supervisor relay — pick one and pin it).
- Resume semantics preserved: supervisor still drives the `engine.resume` path; inner runner accepts a `--resume-from-step <N>` flag.
- `engine.halted {threshold}` still fires on N consecutive terminal failures (counter lives in supervisor).
- Regression test: ship a no-op `src/engine/` patch mid-suite, confirm the next cycle's inner process sees the new code without a supervisor restart.
- Coverage gates green; `triage.ts` line floor (≥ 95%) preserved.
- Both branch-based and `no_branch: true` workflows pass end-to-end under process-per-cycle.
