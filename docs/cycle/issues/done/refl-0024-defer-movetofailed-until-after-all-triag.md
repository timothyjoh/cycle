---
id: refl-0024-defer-movetofailed-until-after-all-triag
title: Defer moveToFailed in triage until after all_triage_failed check; keep raws in raw/ on engine.paused
workflow: feature
depends_on: []
triaged_at: "2026-05-13T20:03:29.158Z"
source: triage
---
## Problem

`src/engine/triage.ts:225` calls `moveToFailed` inside the per-raw failure branch, which runs **before** the whole-pass `failed.length === raws.length` check at `:233`. When the whole pass fails and the engine emits `engine.paused { reason: "all_triage_failed" }`, every raw has already been renamed `docs/cycle/issues/raw/<id>.md → docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped — even though no cycle was started and the operator has not decided whether to give up on those raws.

This was surfaced by cycle 0024 (docs-only): the README recovery flow had to be rewritten to instruct operators to `mv failed/<id>.md raw/<id>.md` just so `cycle triage --dry-run` (which only reads from `raw/`) can see them again. The recovery loop becomes "restore → edit → dry-run → re-fire" instead of "edit → dry-run → re-fire." MUST-FIX.md Task 1 from cycle 0024 explicitly calls this out as deferred engine work.

## Goal

On the all-fail path, raws stay in `raw/` so `cycle triage --dry-run` can re-evaluate them after the operator edits without any manual `mv`. `moveToFailed` still runs in the partial-failure path (some raws decomposed cleanly, others terminally failed) so the queue keeps draining.

## Proposed direction

Split per-raw failure handling in `src/engine/triage.ts`:

- Keep on every per-raw terminal failure: `bumpAttempts` on the raw's frontmatter, per-attempt `triage.raw.failed` log events, accumulation into `last_errors[]` and `raw_ids[]` for the eventual `engine.paused` payload.
- Defer the `raw/<id>.md → failed/<id>.md` rename: collect the failed raw ids into a pending list rather than calling `moveToFailed` immediately.
- After the loop, branch on `failed.length === raws.length`:
  - **All failed** → skip the deferred `moveToFailed` calls, emit `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }`, exit non-zero. Raws remain in `raw/`.
  - **Partial failure** (≥1 raw decomposed cleanly) → flush the deferred `moveToFailed` calls for the failed subset, continue draining the queue as today.

## Acceptance criteria

- All-fail path: no files exist under `docs/cycle/issues/failed/` afterward that weren't there before the triage pass. `raw/` listing is unchanged from pre-pass.
- Partial-failure path: failed raws still end up under `failed/` with `failed_step: "triage"` and `failed_at` stamped, just like today.
- `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }` cardinality and payload shape unchanged.
- Frontmatter `bumpAttempts` and per-attempt `triage.raw.failed` log events still emitted on every attempt on both paths.
- New tests:
  - All-fail pass leaves `raw/` intact and `failed/` untouched.
  - Partial-failure pass still moves the failed subset to `failed/`.
  - `cycle triage --dry-run` after an all-fail pause sees the raws without any manual `mv`.
- Docs updated **in the same cycle** to drop the restore step:
  - `README.md` "Recovering from engine.paused" section — remove the `mv failed/<id>.md raw/<id>.md` step from the all-fail recovery flow.
  - `CLAUDE.md` Architecture quick reference triage paragraph — adjust description of all-fail behavior if it mentions the rename.
  - `docs/RFC-001-issue-lifecycle.md` §5 — reflect that on `all_triage_failed`, raws are not moved.
- Coverage policy holds: line ≥ 95%, branch ≥ 75%, function ≥ 90%, no per-file regressions.

## Out of scope

- Any change to the partial-failure behavior other than preserving today's outcome.
- Any change to `engine.paused` payload schema beyond what's required for the deferred-move refactor (should be none).
- Any change to retry attempt counting or `triage_attempts` frontmatter behavior.
