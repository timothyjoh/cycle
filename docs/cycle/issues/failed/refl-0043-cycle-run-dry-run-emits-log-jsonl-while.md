---
id: refl-0043-cycle-run-dry-run-emits-log-jsonl-while
title: "Make `cycle run \"<text>\" --dry-run` log-file-free to match `cycle drop` (or document the asymmetry)"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T16:00:29.579Z"
source: triage
failed_at: "2026-05-18T21:16:56.309Z"
failed_step: commit
failed_attempts: 3
last_cycle_id: "0158"
---
## Problem

`src/cli.ts:74-75` calls `createLogger(cwd)` and emits `engine.start` before the dry-run short-circuit at `src/cli.ts:314-327`, so `cycle run "<text>" --dry-run` creates `.cycle/log.jsonl` in the consumer repo. `cycle drop` exits earlier and writes no log file. Two "materialize-only" CLI entry points behave differently for an externally observable side effect (a file appearing in `.cycle/`).

The e2e test added in cycle 0043 had to *avoid* asserting log-file absence (PLAN.md called this out explicitly), which signals the asymmetry is load-bearing for the current test design rather than intentional.

## Acceptance

Pick one of the two paths below and execute it end-to-end. Either action is <30 lines.

### Option A — Consolidate (preferred if no test/observability depends on the early `engine.start`)

- Move the `--dry-run` short-circuit in `src/cli.ts` (currently around lines 314-327) above the `createLogger(cwd)` + `engine.start` emission at lines 74-75 so the run-text-dry-run path never touches `.cycle/log.jsonl`.
- Add a regression e2e test asserting that `cycle run "<text>" --dry-run` does NOT create `.cycle/log.jsonl` in the consumer repo (mirror the equivalent assertion that already holds for `cycle drop`).
- Update the existing cycle-0043 e2e test that was forced to avoid the log-absence assertion: flip it to an explicit `assert.equal(fs.existsSync(logPath), false)` once the short-circuit moves.
- Re-check any test or engine code that depends on `engine.start` being emitted before a dry-run early-exit; if anything relies on it, prefer Option B instead.

### Option B — Document (only if the early `engine.start` emit is load-bearing)

- Add a short subsection to CLAUDE.md (under "Architecture quick reference" or a new "CLI surface conventions" heading) calling out the asymmetry: `cycle run --dry-run` writes `.cycle/log.jsonl`; `cycle drop` does not; and why (e.g., `engine.start` audit-trail requirement for run-shaped commands).
- Add an inline comment at `src/cli.ts:74-75` referencing the CLAUDE.md note so a future maintainer doesn't "clean up" by moving the short-circuit and silently breaking the audit-trail contract.
- Keep the cycle-0043 e2e test as-is (no log-absence assertion on the run path).

## Notes

- Investigate first which option is correct: grep for readers of `.cycle/log.jsonl` produced specifically by dry-run invocations (tests, telemetry, resume logic) before choosing. If nothing depends on the dry-run-emitted `engine.start`, Option A is simpler and removes the smell entirely.
- This is CLI-surface symmetry hygiene — small surface, high future-maintainer cost if left undocumented.
- Source: cycle 0043 reflection (`priority_hint: 3`).
