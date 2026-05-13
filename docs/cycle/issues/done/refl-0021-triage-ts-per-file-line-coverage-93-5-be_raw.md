---
id: refl-0021-triage-ts-per-file-line-coverage-93-5-be
source: reflection
title: triage-ts-per-file-line-coverage-93-5-below-95-baseline
added_at: "2026-05-13T19:03:57.424Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0021"
---

`src/engine/triage.ts` reports 93.50% line / 92.41% branch / 96.88% function coverage for cycle 0021. Branch and function exceed the project baselines (75/90), but line is below the 95% project baseline — masked from the gate because the *aggregate* line coverage across `src/` is 96.70%. BUILD.md attributes the gap to pre-existing best-effort `catch` clauses (`loadRaws`, `bumpAttempts`, `moveToFailed`, `rewriteOrdering`) plus `runClaudecodeAgent` subprocess plumbing.

Why it matters: triage is the only writer that moves files out of `raw/` and the only path that mutates `tbd.jsonl` for new work. Untested `catch` branches in `bumpAttempts`/`moveToFailed`/`rewriteOrdering` are exactly the paths that fire when fs/queue invariants are already shaky — a silent swallow there can leave the queue in an inconsistent state (row written but file unmoved, or vice versa). Each new triage feature widens the surface; the aggregate gate will keep hiding the drift until one of the catches actually fires in prod and we discover it untested.

Suggested direction: add fault-injection tests that simulate fs failures inside `bumpAttempts` / `moveToFailed` / `rewriteOrdering` (e.g. read-only tmpdir or a stubbed `fs.rename` that throws) and assert the engine emits the expected `engine.warning` / `triage.failed` event without crashing or leaving partial state. Either close the gap or add a per-file line floor of ~95 on `src/engine/triage.ts` so future regressions surface immediately.
