---
id: refl-0065-extend-step-end-stderr-surface-to-agent
title: Extend head-capped stderr field on failed step.end to agent-path failures (claudecode/codex/gemini)
workflow: feature
depends_on: []
triaged_at: "2026-05-15T18:37:15.195Z"
source: triage
---
## Context

Cycle 0065 added a head-capped `stderr` field to **failed bash** `step.end` events at `src/engine/run-cycle.ts:173-181`, gated on `step.agent === "bash" && r.status === "failed"`. The bash carve-out was deliberate per SPEC; the agent path was scoped out and explicitly flagged for follow-up in both BUILD.md (Deferred / follow-up) and REVIEW.md (Adversarial Test Review observation #2).

Result today: when a `claudecode` / `codex` / `gemini` step fails, the captured stderr is dropped on the floor of the audit log. Operators have no `log.jsonl` trail of *why* the agent failed and must re-run the cycle or shell into the agent process to recover root cause. The cycle 0064 spec-step crash at `.cycle/log.jsonl` 2026-05-15T18:17:11Z is a concrete instance of this masking.

`r.stderr` is already populated on the agent path in three places, so the data exists — only the emission gate is wrong:

- `UnknownAgentError` (`src/engine/run-cycle.ts:147`)
- spec post-condition guard (`src/engine/run-cycle.ts:161`)
- inside each provider module's `runStep` (`src/engine/exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`)

Also relates to (overlaps with) `refl-0029-spec-acceptance-bullet-6-deferred-to-wro`, which targets `UnknownAgentError` specifically via a `stderr_excerpt` field name. This raw subsumes that one by unifying the field shape (`stderr`, not `stderr_excerpt`) across all failure sources — coordinate the two so we don't ship two competing conventions.

## Goal

Failed `step.end` events for **every** agent (`bash`, `claudecode`, `codex`, `gemini`, plus future-registered) carry a head-capped `stderr` field with the same 2000-char truncation contract. Successful `step.end` events still omit it.

## Acceptance criteria

1. The gate at `src/engine/run-cycle.ts:178` is relaxed from `step.agent === "bash" && r.status === "failed"` to `r.status === "failed"` — the bash predicate is dropped.
2. The same `truncateStepEndStderr` helper (currently inline in `run-cycle.ts`) is used for the agent path — no second truncation implementation.
3. Successful `step.end` events (`r.status === "ok"`) continue to omit the `stderr` field entirely, on every agent including bash. Pin this with at least one regression test per agent.
4. Failed `step.end` events on the agent path carry `"stderr": "<head-capped string>"` literally — empty stderr from a non-zero agent exit emits `"stderr": ""` (parity with the bash empty-stderr contract).
5. Failure shapes covered by regression tests, mirroring the three bash-path tests in `tests/engine/run-cycle.step-end-stderr.test.ts`:
   - `UnknownAgentError` on dispatch — uses `r.stderr` from `src/engine/run-cycle.ts:147`.
   - spec post-condition failure — uses `r.stderr` from `src/engine/run-cycle.ts:161`.
   - provider-module non-zero exit — at least one of `claudecode` / `codex` / `gemini` `runStep` returning `{status: "failed", stderr: "..."}`.
   - Over-2000-byte stderr is sliced to `MAX-1` chars + `…` (same truncation as the bash-path tests).
6. `CLAUDE.md` `Architecture quick reference` bullet describing the `stderr` field on `step.end` is updated to drop the bash-only carve-out. The bullet should now read in terms of "every failed `step.end` event" rather than "failed bash `step.end` events".
7. Coordinate with `refl-0029-spec-acceptance-bullet-6-deferred-to-wro`: that raw's intent (surface `UnknownAgentError` via dispatch path) is now closed by this work. The cycle that lands this should either close that raw with a pointer here, or the SPEC step should explicitly call out the overlap so the older raw isn't shipped as a redundant cycle.

## Out of scope

- Changing the field *name* (it stays `stderr`, not `stderr_excerpt`, for parity with the existing bash-path emission).
- Changing the 2000-char cap (it stays at the convention pinned by `MAX_STEP_END_STDERR` and the matching triage `last_errors[].error` truncation at `src/engine/triage.ts:231-233`).
- Extracting `truncateStepEndStderr` into a shared module — that's already explicitly deferred under `refl-0065-extract-shared-head-capped-truncate-help` (third caller threshold). This cycle reuses the existing inline helper.
- Streaming stderr live during step execution (this is post-failure summary only).

## Verification commands

- `npm test` — full suite, including the new agent-path regression tests.
- `npm run test:coverage` — confirm `src/engine/run-cycle.ts` line/branch coverage does not regress.
- Inspect a synthesized failed agent `step.end` event in `log.jsonl` and confirm the `stderr` field is present, non-redundant with already-captured fields, and head-capped.
