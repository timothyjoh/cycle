---
id: refl-0023-dry-run-untested-paths-runagent-throws-a
title: "Cover dryRunTriage failure paths: runAgent throws + missing prompt template"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:46:20.945Z"
source: triage
---
## Context

Adversarial REVIEW of cycle 0023 (`cycle triage --dry-run`) surfaced two `dryRunTriage` code paths in `src/engine/triage.ts` that are reached today only by shared coverage with `runTriage`, never by a test that enters through the `--dry-run` CLI surface:

1. **`runAgent` throws mid dry-run** — the `try/catch` at `src/engine/triage.ts:99` catches the rejection and the per-raw report row falls through to the `lastError: 'agent failed: …'` shape. No dry-run test stubs `runAgent` to throw, so the behavior of the report row in this failure mode is not pinned.
2. **Prompt template file missing** — the prompt path read inside `dryRunTriage` lets `readFile`'s `ENOENT` propagate. Behavior is reasonable (a single top-level throw before any agent invocations) but undocumented and untested for the dry-run entry point.

These are the canonical failure modes for the canonical use case: an operator iterating on the triage prompt after `engine.paused {reason: "all_triage_failed"}`. That's exactly when the prompt file is most likely half-edited / renamed / missing and when an agent process is most likely to crash mid-edit. Today both surface as opaque report rows or raw stack traces.

## What to do

In `tests/engine/triage-dry-run.test.ts`, add two unit cases that enter through `dryRunTriage` (not the shared internal path under `runTriage`):

### Case A — `runAgent` throws

- Stub the `runAgent` dependency on the dry-run path to reject with a representative error (`new Error('boom: claude spawn failed')`).
- Drop one well-formed raw under `docs/cycle/issues/raw/` in the test temp repo.
- Run `dryRunTriage`.
- Assert the returned report contains one row with:
  - `raw_id` matching the raw
  - `status: 'failed'`
  - `last_error` matching `/^agent failed: /` and including the inner error message substring (`boom: claude spawn failed`)
  - `attempts` equal to the configured per-raw retry cap (so we know the dry-run path exhausts retries the same way `runTriage` does — pin whichever shape matches current behavior; if dry-run uses a single attempt by design, document and pin that instead)
- Assert no filesystem mutations under `docs/cycle/issues/` (no new files in `todo/`, no moves out of `raw/`, no `.cycle/tbd.jsonl` writes, no `.cycle/log.jsonl` writes). This is the dry-run contract from CLAUDE.md.

### Case B — prompt template missing

- Configure the dry-run path against a prompt template path that does not exist on disk in the test temp repo.
- Drop one well-formed raw under `docs/cycle/issues/raw/`.
- Pick one of these two shapes and pin it (do not leave it ambiguous):
  - **Per-raw row shape** — the dry-run loop catches the prompt-load error before invoking the agent and emits one report row with `status: 'failed'` and `last_error` matching `/^prompt template missing: /` plus the resolved path. Preferred if it requires only a localized try/catch around the template read inside the per-raw loop.
  - **Top-level throw shape** — `dryRunTriage` throws a typed error (`PromptTemplateMissingError` or equivalent) before any agent invocations, with the resolved template path in the message. CLI maps that to a non-zero exit and a single stderr line.
- Whichever shape is chosen: assert it in the new test, and assert no filesystem mutations under `docs/cycle/issues/` and no writes to `.cycle/tbd.jsonl` or `.cycle/log.jsonl`.

## Acceptance

- Both new tests fail on master and pass after the change.
- `npm test` and `npm run typecheck` clean.
- Coverage report shows the two previously-uncovered branches in `src/engine/triage.ts` (the `runAgent` catch and the prompt-template-missing path) are now covered specifically by tests that enter through `dryRunTriage`.
- The chosen shape for case B is documented in a one-line comment next to the corresponding code in `triage.ts` so a future reader knows it's intentional, not accidental.

## Non-goals

- Do not change `runTriage` (non-dry-run) behavior for these two failure modes — this raw is strictly about the dry-run entry point.
- Do not change the per-raw retry policy.
- Do not introduce a new public error class unless case B's top-level-throw shape is chosen.
