---
id: refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts
title: Implement empty-diff post-condition guard in src/engine/run-cycle.ts
workflow: feature
depends_on: []
triaged_at: 2026-05-16T00:00:00.000Z
source: triage
parent: ""
---
Problem

src/engine/run-cycle.ts has no guard that checks whether a build or fix step produced any src/ changes. Cycles can report status:ok while the actual diff contains only cycle artifact files (BUILD.md, RESEARCH.md, etc.), resulting in misleading commit titles that claim implementation work was done.

This was originally tracked in refl-0078-build-and-fix-steps-silently-succeed-whe.md (now in done/) but the guard was never implemented. Cycle 0108 verification confirmed absence at lines 198-228 of run-cycle.ts.

Required Implementation

After a build or fix step completes with status:ok, run:
  git diff HEAD -- src/ | head -1
If the output is empty (no src/ changes), the step should be re-classified as a failure and the cycle should halt or retry rather than continue to commit.

The precedent for step-name-based post-conditions is at src/engine/run-cycle.ts:198-204 (spec-byte-floor guard).

Acceptance Criteria

- [ ] src/engine/run-cycle.ts contains a diff check after build/fix steps that exits non-zero when no src/ files changed
- [ ] A test in tests/engine/ covers the zero-diff case for build and fix steps
- [ ] npm test passes with no regressions
- [ ] Coverage does not drop below baseline