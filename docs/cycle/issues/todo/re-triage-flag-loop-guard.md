---
id: re-triage-flag-loop-guard
title: "Loop guard: cap re-triage chain length, move to failed/ with reason on overflow"
workflow: feature
depends_on: [re-triage-flag-engine-detection, re-triage-flag-triage-handling]
triaged_at: "2026-05-13T18:15:57.095Z"
source: triage
parent: re-triage-flag
---
## Why

Without a cap, a poorly-shaped issue could ping-pong between `todo/` and `raw/` forever — every cycle's `spec` step flags `re_triage: true`, triage re-decomposes, the new children inherit the same fuzzy underlying problem, one of them again flags `re_triage: true`, and so on. We need a deterministic backstop that turns this into a loud terminal failure rather than a silent infinite loop.

## Scope

Add a `re_triage_generation` cap that converts overflow into a `failed/` move.

- Where the check runs: in `src/engine/triage.ts`, **before** invoking the agent for a given raw. If the raw has `re_triage: true` and the inherited `re_triage_count` (or, equivalently, the `re_triage_generation` of the lineage — see [[re-triage-flag-triage-handling]]) is ≥ `engine.max_re_triage_generations` from `workflows.yml` (default: 3), do not call the agent. Instead:
  - Stamp the raw file's frontmatter with `failed_at` (ISO timestamp), `failed_reason: "re_triage_loop"`, and `failed_re_triage_generations: <n>`.
  - Move the file `raw/<id>.md → failed/<id>.md` atomically.
  - Do not write the raw to `done/_raw.md` (it never reached a child).
  - Emit `triage.re_triage_loop_aborted { id, generations, threshold }` to `.cycle/log.jsonl`.
  - Call `propagateBlocked(repoRoot, <raw_id>, log)` so any queue items that depended on the lineage's prior id are moved to `blocked/` consistently with normal failure handling.
  - This counts as a triage-pass failure for the purposes of the existing per-raw retry budget? **No** — it is a *successful* terminal disposition (we deliberately stopped the loop). Do not consume the 3-attempt retry budget, do not feed it back as a validator error. The remaining raws in the pass continue to be triaged normally.
- Config: add `engine.max_re_triage_generations: 3` to the default `workflows.yml` (sibling to `engine.max_consecutive_failures`). Document the knob in CLAUDE.md alongside the existing halt-policy paragraph.
- The non-overflow path is unchanged: re-triaged raws under the cap go through the agent as described in [[re-triage-flag-triage-handling]].

## Acceptance

- Unit tests in `tests/engine/triage-loop-guard.test.ts`:
  - Raw with `re_triage: true` and `re_triage_count: 3` (== threshold) → file moves to `failed/`, frontmatter stamped, `triage.re_triage_loop_aborted` emitted, no agent call made, retry budget untouched.
  - Raw with `re_triage_count: 2` and threshold 3 → agent IS called (sanity check the boundary).
  - When the lineage has dependents in `tbd.jsonl`, `propagateBlocked` is invoked and they move to `blocked/`.
  - Custom threshold in `workflows.yml` is respected (set to 1 in the test and verify a `re_triage_count: 1` raw aborts).
- Typecheck and full suite pass; coverage does not regress.
- Update CLAUDE.md to add: "Re-triage loop guard: `engine.max_re_triage_generations` (default 3) caps how many times one lineage may be re-triaged; overflow moves the raw to `failed/` with `failed_reason: re_triage_loop` and propagates blocked."
