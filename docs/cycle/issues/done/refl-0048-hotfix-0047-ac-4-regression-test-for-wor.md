---
id: refl-0048-hotfix-0047-ac-4-regression-test-for-wor
title: Land cycle 0047 AC-4 regression test pinning `.cycle/workflows.yml` trunk-based shape
workflow: feature
depends_on: []
triaged_at: "2026-05-14T17:23:23.486Z"
source: triage
---
## Context

Cycle 0047's hotfix to restore `.cycle/workflows.yml` after the 0046 sync-defaults clobber shipped only the file restoration (housekeeping commit `56e0e07`). The hotfix's documented AC-4 regression test — pinning the trunk-based shape of `.cycle/workflows.yml` — never landed:

- `docs/cycle/issues/done/refl-0046-...-hotfix-restore-workflows-yml-divergence.md` exists.
- `docs/cycle/0047*/` is empty; the engine log shows `engine.warning {reason: resume_row_mismatch}` for cycle 0047.
- 0047's RESEARCH.md flagged the missing AC-4 test explicitly; PLAN.md deferred it.

The new `sync-defaults` divergence guard (cycle 0048) only protects against the `npm run sync-defaults` script path. A direct human edit, a stray merge, or an LLM edit to `.cycle/workflows.yml` would silently revert the trunk-based shape with no failing test. That shape is load-bearing for this repo's dogfood loop — it is the reason the engine commits via `commit-trunk.sh` and skips `pr`.

Sibling cycle 0048 already files [[refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override]] as the longer-horizon "eliminate the divergence entirely" play. This issue is the short-horizon belt-and-suspenders pin so the current shape can't drift while that larger refactor is queued.

## Scope

Add a single new test file: `tests/defaults/local-workflows-divergence.test.ts` (or co-locate under an existing `tests/` group if the layout pattern dictates — match what `tests/defaults/` looks like today; create the folder if it doesn't exist). The test reads `.cycle/workflows.yml` from the repo root, parses it as YAML, and asserts the three invariants below.

## Acceptance criteria

1. New test file exists at `tests/defaults/local-workflows-divergence.test.ts` (or the closest matching path under `tests/` — match existing layout).
2. The test reads `.cycle/workflows.yml` from the repo root and parses it as YAML.
3. The test asserts `workflows.feature.no_branch === true` (or however the parsed config exposes it; mirror existing parse helpers in `src/engine/workflow.ts` if useful).
4. The test asserts the `commit` step in the `feature` workflow references `commit-trunk.sh` (not `commit.sh`). Search by the step's `script:` / `run:` field — whatever the workflow schema uses today.
5. The test asserts no step in the `feature` workflow has `name: pr`.
6. Each assertion has a failure message naming the invariant violated (e.g. `"feature.no_branch must be true to preserve trunk-based dogfood loop"`) so a future regression is obviously a divergence revert, not a generic test failure.
7. The test is included in the default `npm test` run (no opt-in flag).
8. Test passes against current master.

## Notes

- This is the AC-4 0047 deferred. Frame the test file's header comment as "regression pin for cycle 0046 incident" so future archaeology lands on the right context.
- Do not introduce a shared helper for parsing `.cycle/workflows.yml` — one-off direct read + YAML.parse is fine. If a parse helper already exists in `src/engine/workflow.ts` that's safe to import from tests, prefer it; otherwise inline.
- Keep the test ~25 lines, single file. Do not refactor the YAML loader or workflow schema as part of this cycle.
- This is intentionally not the same work as [[refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override]]; that one removes the divergence by making `no_branch` operator-overridable at runtime. This one pins the current shape until that lands.
