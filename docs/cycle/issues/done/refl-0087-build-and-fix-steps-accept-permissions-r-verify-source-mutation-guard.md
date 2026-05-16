---
id: refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-guard
title: Add source-file mutation guard to verify step (exit non-zero when only docs/cycle/ changed)
workflow: feature
depends_on: []
triaged_at: "2026-05-16T03:06:11.012Z"
source: triage
parent: refl-0087-build-and-fix-steps-accept-permissions-r
---
## Problem

In cycles 0083–0087, build and fix agents were blocked by `settings.local.json` write restrictions. Instead of failing, they wrote permission-approval prose to BUILD.md / FIX.md and exited 0. The engine recorded `step.end status:ok` and the cycle proceeded to verify, commit, and drain as done — with zero source files changed.

This is a permissions catch-22 variant of the empty-diff false-positive: the artifact dir (`docs/cycle/<id>/`) gains new files (BUILD.md, FIX.md) even when source files are untouched, so no artifact-presence guard catches it. The verify step is the last gate before commit and must close this gap.

## Fix

In `scripts/verify.sh` (or the verify prompt, whichever drives verify step logic), add a check that at least one non-artifact source file was modified relative to the base commit:

```sh
BASE="${CYCLE_BASE:-master}"
changed=$(git diff --name-only "$BASE"...HEAD | grep -v '^docs/cycle/' | wc -l | tr -d ' ')
if [ "$changed" -eq 0 ]; then
  echo "verify: no src changes relative to $BASE — only docs/cycle/ paths or nothing changed" >&2
  exit 1
fi
```

The filter must exclude `docs/cycle/` paths (reflection artifacts, cycle issue markdown) but allow all other paths: `src/`, `tests/`, `scripts/`, `README.md`, non-cycle `docs/`, etc.

## Acceptance Criteria

1. `verify.sh` exits non-zero when `git diff --name-only $BASE...HEAD` returns only `docs/cycle/` paths (or no paths).
2. `verify.sh` exits 0 when at least one non-`docs/cycle/` file is modified.
3. The check uses `CYCLE_BASE` env var with `master` fallback — consistent with other verify checks.
4. Stderr message clearly identifies the failure mode (not a generic exit).
5. `npm test` passes on master after the change.
