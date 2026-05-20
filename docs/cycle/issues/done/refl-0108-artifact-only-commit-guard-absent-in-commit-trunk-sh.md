---
id: refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh
title: Implement artifact-only commit guard in .cycle/scripts/commit-trunk.sh
workflow: feature
depends_on: []
triaged_at: 2026-05-16T00:00:00.000Z
source: triage
parent: ""
---
Problem

.cycle/scripts/commit-trunk.sh exits 0 when nothing is staged (lines 62-65) but does not check whether staged files include any src/ paths. A commit containing only artifact files (docs/cycle/, .cycle/engine.log, etc.) will succeed, producing a commit whose title implies implementation work but whose diff contains none.

This was originally tracked in refl-0083-commit-trunk-sh-commits-artifact-only-ch.md (now in done/) but the guard was never implemented. Cycle 0100 commit message claimed the fix landed but file inspection in cycle 0108 confirmed absence.

Required Implementation

After the empty-cache check (line 62), add:
  if ! git diff --cached --name-only | grep -q ^src/; then
    echo commit-trunk.sh: no src/ changes staged - artifact-only commit blocked
    exit 1
  fi

This exits non-zero for artifact-only commits, forcing the engine to surface the failure rather than silently land a misleading commit.

Acceptance Criteria

- [ ] .cycle/scripts/commit-trunk.sh contains a src/-filter guard that exits non-zero for artifact-only staged indexes
- [ ] A test in tests/ covers the artifact-only case (no src/ in staged files -> exit 1)
- [ ] npm test passes with no regressions
- [ ] Coverage does not drop below baseline