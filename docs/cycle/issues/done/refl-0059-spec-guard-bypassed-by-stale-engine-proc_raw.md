---
id: refl-0059-spec-guard-bypassed-by-stale-engine-proc
source: reflection
title: spec-guard-bypassed-by-stale-engine-process
added_at: "2026-05-14T21:34:29.214Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0059"
---

Cycle 0058 shipped `SPEC_MIN_BYTES = 200` in `src/engine/run-cycle.ts` and a passing regression test (sanitized stdout `< 200` → `r.status = failed`). Cycle 0059 ran immediately after, generated a 116-byte `SPEC.md` (`SPEC.md emit to stdout. Engine capture write to docs/cycle/.../SPEC.md.`), and the spec step still emitted `step.end status:"ok"`. REVIEW.md and PLAN.md §Risk Assessment both note the guard "did not fire here" and waved it out of scope.

Most likely cause: the engine is a long-lived loop that loads `dist/cycle.js` once at process start, so cycles that land code improvements in `src/engine/` cannot consume those improvements until the engine is restarted. This is a structural ceiling on the dogfood self-improvement loop — every infrastructure cycle's first beneficiary is the *next* engine run, not the next cycle. Even with `pretest` rebuilding `dist/`, the loaded module graph in the running process is stale.

Direction: either (a) make the loop spawn a fresh `node dist/cycle.js` per cycle (process-per-cycle, restart picks up `dist/` automatically), (b) re-import `run-cycle` from disk at the top of each loop iteration, or (c) emit a structured warning on `engine.start` when `dist/cycle.js` mtime is newer than process start so the operator restarts. Option (a) is the cleanest but costs ~1s of cold start per cycle.
