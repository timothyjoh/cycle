---
id: refl-0050-structural-invariant-checks-not-enforced
title: Add build-time structural-invariants guard (seed with triage.ts childIds single-Set rule)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T18:22:07.895Z"
source: triage
---
## Problem

Cycle 0050 PLAN Task 2 required a regression test that fails if `childIds` is artificially split back into two sets — a structural invariant ("exactly one canonical Set") proving the consolidation is load-bearing. REVIEW.md Finding 1 (Adversarial) confirmed the criterion is unmet: `tests/engine/triage-validator.test.ts:305-340` passes equally well whether `childIds` is one set or two synchronized copies, because the validator's public API exposes only accept/reject + parsed output. Black-box behavioral tests cannot pin "there is exactly one of X" — only syntax / AST checks at build time can.

Today the invariant is held only by a one-shot manual `rg` performed during BUILD. Nothing prevents a future contributor from re-introducing the duplicate-Set anti-pattern. The same gap applies to every "exactly one of X" or "X is the single source of truth" invariant in any pure function.

## Goal

Add a small build-time structural-invariants checker analogous to `scripts/coverage-gate.mjs`'s per-file line-floor enforcement. Seed it with the `triage.ts` `childIds` invariant so cycle 0050's consolidation becomes load-bearing on a CI gate, not on tribal memory. Extend in future cycles as more canonical-single-instance invariants surface.

## Suggested shape

- New script `scripts/structural-invariants.mjs` driven by a small in-file table:
  ```js
  const INVARIANTS = [
    {
      file: 'src/engine/triage.ts',
      pattern: /const childIds = new Set/g,
      expected: 1,
      reason: 'cycle 0050: childIds must be a single canonical Set',
    },
    {
      file: 'src/engine/triage.ts',
      pattern: /new Set\(children\.map\(\(c\) => c\.id\)\)/g,
      expected: 0,
      reason: 'cycle 0050: do not reconstruct childIds from children.map',
    },
  ];
  ```
- For each entry: read the file, count regex matches, compare against `expected`, emit a structured stderr line on mismatch, exit non-zero on any failure.
- Wire into one of the gates already running on every cycle. Recommended: extend `posttest:coverage` to fan out to both `check:coverage` and a new `check:invariants`, OR add a `prebuild` / `pretest` hook that runs the invariants gate.
- Keep the table in-file (single source of truth, no external config) until enough invariants accrue to justify extraction — same posture as `coverage-gate.mjs`'s `FLOORS` table.

## Acceptance

- `scripts/structural-invariants.mjs` exists, exits 0 on a clean master and 1 (with named regex + file + actual-vs-expected count on stderr) when an invariant is violated.
- Wired into a step the dogfooded workflow already runs (`pretest`, `posttest:coverage`, or `npm run typecheck`); a CI run that re-introduces a second `const childIds = new Set` line in `src/engine/triage.ts` fails before reaching publish.
- A regression test re-introduces the duplicate Set in a fixture file and asserts the script exits non-zero with the expected stderr — proving the gate is load-bearing on the invariant, not just present.
- CLAUDE.md gets a short Structural-invariants policy section near the Coverage policy section, pointing to the script as the single source of truth for the `INVARIANTS` table — same posture as the existing `FLOORS` doc.

## Out of scope

- AST-based checking (regex over source text is sufficient for the seed invariant; promote to AST only when a regex check produces false positives).
- Broader "canonical state" invariants in other files (extend the table as future cycles surface them).

## Origin

Reflection from cycle 0050 (`docs/cycle/0050-feature-consolidate-triage-validator-child-id-tr/REFLECTION.md`), priority_hint 7.
