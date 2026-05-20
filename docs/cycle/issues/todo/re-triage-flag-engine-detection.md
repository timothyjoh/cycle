---
id: re-triage-flag-engine-detection
title: "Engine: detect `re_triage: true` in step artifact, abort cycle, move todo/ → raw/"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:15:57.095Z"
source: triage
parent: re-triage-flag
failed_at: "2026-05-13T22:23:31.812Z"
failed_step: spec
failed_attempts: 3
---
## Why

A cycle step (typically `spec` or `plan`) may discover that its issue is bigger than the current decomposition suggests and needs to be re-broken-down. Today the only outcomes for a step are success or failure; there is no third path that says "this work is real but the *shape* is wrong — punt me back to triage." Without that path, an oversized child either gets force-fit into a single cycle or fails noisily.

## Scope

Teach the engine to recognize a `re_triage: true` signal coming out of a step and treat it as a deliberate re-triage request rather than a step failure.

- Define the signal channel: a step writes `re_triage: true` (plus an optional `re_triage_reason: <string>`) into the **issue file's** frontmatter (`docs/cycle/issues/todo/<id>.md`) during execution. The issue file is the natural carrier — every step already reads/writes it via the workflow runner, and the change survives partial progress.
- After each step in `src/engine/run-cycle.ts`, re-read the in-progress issue file's frontmatter. If `re_triage: true` is set:
  - Stop executing further workflow steps for this cycle (do not call subsequent prompt/script steps).
  - Emit `cycle.re_triage_requested { id, cycle_id, step, reason }` to `.cycle/log.jsonl`.
  - Increment a new `re_triage_count` integer on the issue file's frontmatter (start from existing value or 0). Do **not** clear the `re_triage: true` flag yet — triage will consume it (see [[re-triage-flag-triage-handling]]).
  - Move the file `todo/<id>.md → raw/<id>.md` via the same atomic tmp-rename pattern used elsewhere in the engine.
  - Update `tbd.jsonl`: drop the row for `id` (it is no longer a pending todo; it will reappear as a raw and be re-triaged on the next pass).
  - Emit `cycle.end { id, cycle_id, status: "re_triaged" }` — a new terminal status that is neither `ok` nor `failed`. This must NOT increment the consecutive-failure counter and must NOT call `propagateBlocked` (the work is not failing, it is being re-planned).
  - Do not run the `reflection` step for a re-triaged cycle.
- Resume semantics: if the engine crashes between writing the issue file's `re_triage: true` and completing the todo→raw move, resume-from-log-tail must finish the move on next start. Easiest path: when log-tail sees `cycle.re_triage_requested` with no matching `cycle.end status:re_triaged`, treat it as resumable re-triage and replay the move + tbd update before falling through to the normal triage→pop loop.
- The cycle branch is **not** force-deleted on re-triage; leave it in place for human inspection (matches failure handling).

## Acceptance

- Unit tests in `tests/engine/run-cycle-re-triage.test.ts`:
  - Step writes `re_triage: true` to issue frontmatter → subsequent steps are not invoked, file moves to `raw/`, tbd row is dropped, `cycle.end status:re_triaged` event is emitted, consecutive-failure counter is unaffected.
  - `re_triage_count` increments correctly across multiple re-triage events on the same issue.
  - `reflection` step is skipped on re-triage.
  - `propagateBlocked` is not called.
- Resume test: crash simulated after `cycle.re_triage_requested` but before file move; engine.start replays the move.
- Typecheck and full suite pass; coverage does not regress vs current baseline (≥95% line / ≥75% branch / ≥90% func).
- `CLAUDE.md` is updated under "Architecture quick reference" with one paragraph describing the re-triage signal, the new event/status, and the file-move semantics.
