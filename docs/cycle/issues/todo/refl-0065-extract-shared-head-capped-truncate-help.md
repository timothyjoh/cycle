---
id: refl-0065-extract-shared-head-capped-truncate-help
title: Extract shared head-capped truncate helper once third caller lands
workflow: quickfix
depends_on: [refl-0065-extend-step-end-stderr-surface-to-agent]
triaged_at: "2026-05-15T18:38:58.474Z"
source: triage
---
## Context

`src/engine/run-cycle.ts:27-29` defines `MAX_STEP_END_STDERR = 2000` + `truncateStepEndStderr(s)` as a byte-for-byte duplicate of `src/engine/triage.ts:231-233`'s `MAX_ERR_LEN = 2000` + `truncate(s)` (used by `engine.paused last_errors[].error`).

Both implementations follow the same head-capped contract: slice to `MAX-1` + `…` when input exceeds `MAX`. The duplication is currently flagged as intentional in CLAUDE.md and BUILD.md with the rule "extract a shared helper when a third caller lands."

The predecessor cycle `refl-0065-extend-step-end-stderr-surface-to-agent` extends the head-capped stderr surface to agent-path failures (claudecode/codex/gemini). That is the third caller — at minimum it adds a third inline copy of the pattern, more if each agent module gets its own.

## Why it matters

The head-capped truncate convention is now a load-bearing engine-wide contract:

- 2000-char cap (`MAX`)
- Slice to `MAX - 1`, append `…` (single character, not `"..."`)
- Boundary: input length strictly greater than `MAX` triggers truncation
- Pinned by tests in both `tests/defaults/` and `tests/engine/run-cycle.step-end-stderr.test.ts`

With three or more inline copies, drift risk crosses the threshold where a shared helper pays for itself.

## Work

1. Add `truncateHeadCapped(s: string, max: number): string` to `src/engine/log.ts` (alongside the logger interface that consumes these truncated values) OR a new tiny `src/engine/log-fmt.ts` if `log.ts` shouldn't grow.
2. Replace all call sites:
   - `src/engine/run-cycle.ts` (`truncateStepEndStderr` → `truncateHeadCapped(s, MAX_STEP_END_STDERR)`)
   - `src/engine/triage.ts:231-233` (`truncate` → `truncateHeadCapped(s, MAX_ERR_LEN)`)
   - Whichever agent-path call sites landed in the predecessor cycle
3. Keep the `MAX_*` constants at their current call sites; only the truncation logic moves.
4. Update CLAUDE.md:
   - Remove the "duplicate of triage.ts:231-233 is intentional" note from the failed-bash `step.end` paragraph
   - Remove the matching "extract a shared helper when a third caller lands" comment
   - Add a one-liner pointing to the shared helper location
5. Verify the byte-shape: `truncateHeadCapped("a".repeat(2000), 2000) === "a".repeat(2000)` (no truncation at exact threshold); `truncateHeadCapped("a".repeat(2001), 2000).length === 2000` and ends with `…`.

## Acceptance

- One shared helper exported from `src/engine/log.ts` (or `src/engine/log-fmt.ts`).
- All three+ inline copies removed; all consumers route through the helper.
- Existing tests in `tests/defaults/` and `tests/engine/run-cycle.step-end-stderr.test.ts` still pass byte-for-byte.
- At least one focused unit test pinning the boundary cases (input ≤ max, input == max, input == max+1, input >> max).
- CLAUDE.md notes updated; no orphaned references to "intentional duplicate" / "third caller lands".
- Coverage does not regress.
