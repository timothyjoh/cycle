---
id: refl-0043-no-direct-byte-equivalence-check-between
title: "Add direct byte-equivalence test pinning `cycle drop` and `cycle run \"<text>\"` frontmatter shape"
workflow: feature
depends_on: [refl-0043-frontmatter-byte-shape-pin-misses-blank]
triaged_at: "2026-05-14T16:02:02.497Z"
source: triage
failed_at: "2026-05-18T22:15:17.021Z"
failed_step: commit
failed_attempts: 3
last_cycle_id: "0160"
---
## Context

Cycle 0043 chose Option A (pin `run`'s frontmatter independently) over Option B (collapse `drop` and `run "<text>"` into a shared helper). The result is two structurally-parallel tests at `tests/cli/multi-loop.test.ts:123-147` and `:149-197`, each pinning its own derived `expectedFrontmatter` string. Neither test compares `drop` output to `run` output directly.

If a future change touches `materializeFreeformIssue` AND one of the call sites in the same diff, both tests could be updated in lockstep to still pass while the two paths silently diverge. The convention "shared writer" is currently enforced by code review and the single-source `materializeFreeformIssue` function, but is not pinned by any test.

## What to do

Add one new test in `tests/cli/multi-loop.test.ts` (or a sibling file) that:

1. Runs `cycle drop "<text>" --priority N` in temp root A.
2. Runs `cycle run "<text>" --dry-run` (or whatever the equivalent text-path command is) with the same `<text>` + same `N` in temp root B.
3. Reads each command's resulting `docs/cycle/issues/raw/<id>.md` file.
4. Substitutes the timestamp-dependent `id:` and `added_at:` lines in each frontmatter block with a placeholder (e.g. `id: <ID>` / `added_at: <TS>`).
5. Asserts the two normalized frontmatter blocks are **byte-equal** (`assert.strictEqual` on the substituted strings).

The assertion's failure message should make the divergence obvious — e.g. show both blocks side by side or include a diff.

## Acceptance

- New test exists in `tests/cli/` and runs as part of `npm test`.
- Test runs both `drop` and `run "<text>"` end-to-end (real CLI invocations, not direct `materializeFreeformIssue` calls), since the point is to pin the two **call sites'** output equivalence.
- After normalizing `id:` and `added_at:` lines, the two frontmatter byte-strings are equal.
- Coverage does not regress.
- Depends on `refl-0043-frontmatter-byte-shape-pin-misses-blank` landing first so the byte-shape includes the mandatory trailing blank line and the equivalence check is meaningful across the full frontmatter+separator region.

## Why this priority

Low priority (priority_hint: 2 from reflection). The writer is currently single-sourced (`materializeFreeformIssue`) and unit-tested directly; this is a hardening follow-up, not an urgent fix. Files this as the cross-site invariant pin so future divergence is caught at the CLI surface, not just at the unit boundary.
