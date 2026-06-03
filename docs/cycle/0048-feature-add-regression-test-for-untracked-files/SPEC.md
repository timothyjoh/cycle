# SPEC — Cycle 0048: Regression test locking `--untracked-files=all` in the doc-deliverable scan

## WHY
Cycle 0046 added `--untracked-files=all` to the doc-deliverable `git status --porcelain` scan in `src/engine/run-cycle.ts` (the `expects_code: false` opt-out path). Without that flag, a brand-new untracked `docs/` subtree collapses to a single `?? docs/` porcelain entry, and `parseDocDeliverablePaths` would treat that bare directory entry as an in-scope deliverable — wrongly relaxing the no-deliverable guard. The flag forces per-file listing so the scan sees real file paths. This deviation is currently unprotected: every case in `tests/engine/empty-diff-guard.test.ts` places the deliverable at a top-level `docs/RFC-x.md`, which lists identically with or without the flag. Removing `--untracked-files=all` would still pass the entire suite while silently reintroducing the bug.

## CONCRETE USER BENEFIT
A maintainer who deletes or weakens the `--untracked-files=all` flag in the doc-deliverable scan now gets an immediate, named test failure (`npm test`) instead of a green suite. The contract that "a doc-only cycle whose deliverable lives in a freshly-created untracked subdirectory still commits `ok`" becomes a checked, regression-proof guarantee rather than an undocumented implementation detail.

## USABLE END-STATE
The maintainer runs `npm test`; the new case passes against the current code. If they then remove `--untracked-files=all` from the doc-deliverable scan in `src/engine/run-cycle.ts`, the new case fails — pinning the deviation rationale to an executable check.

## SCAFFOLDING ESCAPE HATCH
Not applicable — this round delivers a direct, observable benefit (a discriminating regression guard).

## Objective
Add one integration case to `tests/engine/empty-diff-guard.test.ts` that exercises the `expects_code: false` opt-out with the sole doc deliverable in a brand-new, fully untracked subdirectory, asserting the cycle completes `ok`. The case is constructed so it fails if `--untracked-files=all` is removed from the doc-deliverable scan, locking cycle 0046's PLAN→BUILD deviation behind an executable test. This is a test-only addition; no production code change is expected.

## Source Issue
`refl-0046-regression-test-for-untracked-files-all` — "Add regression test for --untracked-files=all doc-deliverable subtree detection"

## Scope

### In Scope
- One new integration test case in `tests/engine/empty-diff-guard.test.ts` mirroring an existing passing `expects_code: false` doc-deliverable case, changing only the deliverable to a brand-new untracked subdirectory path (e.g. `docs/adr/0001.md`).
- The case asserts the cycle resolves to `ok` (docs committed via the normal `commitCycle` path), not `cycle.noop`.

### Out of Scope
- Any change to production code in `src/engine/run-cycle.ts` (`resolveExpectsCode`, `parseDocDeliverablePaths`, or the doc-deliverable scan). None is expected.
- New structural-invariants entries or coverage-floor changes.
- Refactoring or de-duplicating the existing test cases in the file.

## Requirements
- The new case sets `expects_code: false` on the source issue, produces an empty `src scripts tests` diff, and places the **only** doc deliverable in a previously-nonexistent, fully untracked subdirectory so that without `--untracked-files=all` the scan would observe only `?? docs/<subdir>/` (a bare directory entry).
- The case reuses the existing fake-`claude` harness and helpers already used by the other cases in the file; no new test infrastructure.
- The assertion verifies the cycle outcome is `ok` and that the resolution is **not** `cycle.noop` (i.e. it drains via `commitCycle`, not `noopDrain`).
- The new case must be **discriminating**: it passes against current code and fails if `--untracked-files=all` is removed from the doc-deliverable scan.
- Non-functional: the case is deterministic and self-contained — it creates its own temp repo/fixtures and cleans up like sibling cases, introducing no cross-test ordering dependency.
- **Failure behavior**: This is a test-only addition with no runtime failure surface of its own. The behavior under test is the engine's existing doc-deliverable guard: when `expects_code: false`, the code diff is empty, and a non-empty in-scope doc deliverable exists in an untracked subtree, the build/fix step keeps `status: "ok"` and the cycle commits the docs — it does not silently swallow the case as a `noop` or fail the guard. The test asserts this observable outcome. If the deliverable were absent, the engine would (correctly) fail the empty-diff guard; that anti-slop path is exercised by existing cases and is not weakened here.

## Acceptance Criteria
- [ ] A new integration case exists in `tests/engine/empty-diff-guard.test.ts` whose sole doc deliverable is written to a brand-new, fully untracked subdirectory (e.g. `docs/adr/0001.md`).
- [ ] **User-observable benefit:** running `npm test` passes with the new case green against the current `src/engine/run-cycle.ts`.
- [ ] The new case asserts the cycle outcome is `ok` (docs committed via `commitCycle`) and that no `cycle.noop` / `noopDrain` path was taken.
- [ ] **Failure-path / discriminating criterion:** with `--untracked-files=all` removed from the doc-deliverable scan in `src/engine/run-cycle.ts`, the new case fails (it does not stay green) — confirming the scan would otherwise mis-read the untracked subtree as a bare `?? docs/` entry and mis-route the cycle.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Framework: the repository's existing `node:test` suite, run via `npm test` (auto-builds first) and `npm run test:coverage`.
- Approach: extend `tests/engine/empty-diff-guard.test.ts`, mirroring an existing passing `expects_code: false` doc-deliverable case and changing only the deliverable path to a new untracked subtree.
- Key scenarios:
  - Happy path: `expects_code: false` + empty code diff + sole deliverable at `docs/<new-subdir>/<file>.md` → cycle resolves `ok`.
  - Discriminating regression: the case must fail when `--untracked-files=all` is removed (manually verify by temporarily removing the flag during development, then restoring it).
  - Negative-control reliance: existing top-level `docs/RFC-x.md` cases remain green, confirming the new case adds discriminating coverage rather than duplicating it.
- No UI changes; no E2E/Playwright work required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command change; the `--untracked-files=all` behavior is already described in the run-cycle notes. No edit required.
- **README.md**: No user-facing change to surface.

This is a test-only addition; the production behavior and its documentation are unchanged. The "Documentation Updates" obligation is satisfied by confirming no doc edits are warranted.

## Dependencies
- Existing fake-`claude` harness and helpers in `tests/engine/empty-diff-guard.test.ts` and `tests/helpers.ts`.
- The `expects_code: false` opt-out path and doc-deliverable scan already present in `src/engine/run-cycle.ts` (`resolveExpectsCode` / `parseDocDeliverablePaths`).
- Node ≥ 22.6 with `--experimental-strip-types`; no external services or env vars required.
