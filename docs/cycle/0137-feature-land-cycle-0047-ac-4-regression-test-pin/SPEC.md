Need write permission. Outputting SPEC.md to stdout as the engine requires:

---

# SPEC — Cycle 0137: Land cycle 0047 AC-4 Regression Test Pinning `.cycle/workflows.yml` Trunk-Based Shape

## Objective
Add a single regression-pin test that reads `.cycle/workflows.yml` from the repo root and asserts the three trunk-based invariants that the 0046 sync-defaults clobber incident wiped out. The test ensures future edits — human, LLM, or merge — cannot silently revert the trunk-based dogfood shape without a failing CI check.

## Source Issue
`refl-0048-hotfix-0047-ac-4-regression-test-for-wor` — "Land cycle 0047 AC-4 regression test pinning `.cycle/workflows.yml` trunk-based shape"

## Scope

### In Scope
- New file `tests/defaults/local-workflows-divergence.test.ts` (matches existing `tests/defaults/` layout)
- Three assertions against `.cycle/workflows.yml`: `no_branch`, commit step script, no `pr` step
- File runs as part of default `npm test` with no opt-in flag

### Out of Scope
- Making `no_branch` operator-overridable at runtime (that is `refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override`)
- Introducing shared YAML parse helpers or refactoring `src/engine/workflow.ts`
- Any changes to `.cycle/workflows.yml` itself

## Requirements
- Read `.cycle/workflows.yml` using inline `fs.readFileSync` + `yaml.parse` (or import existing safe parse helper from `src/engine/workflow.ts` if one exists — otherwise inline)
- Assert `feature.no_branch === true` with named failure message
- Assert the `feature` workflow's commit step references `commit-trunk.sh` (not `commit.sh`) with named failure message
- Assert no step in `feature` has `name: pr` with named failure message
- Each failure message must name the invariant, e.g. `"feature.no_branch must be true to preserve trunk-based dogfood loop"`
- Header comment frames this as "regression pin for cycle 0046 incident"
- Keep file ≤ 25 lines

## Acceptance Criteria
- [ ] `tests/defaults/local-workflows-divergence.test.ts` exists
- [ ] Test reads `.cycle/workflows.yml` from repo root and parses as YAML
- [ ] Test asserts `feature.no_branch === true`
- [ ] Test asserts the `feature` commit step script field references `commit-trunk.sh`
- [ ] Test asserts no step in `feature` has `name: pr`
- [ ] Each assertion includes a named failure message identifying the invariant
- [ ] `npm test` runs and passes this file with no opt-in flag
- [ ] All existing tests still pass

## Testing Strategy
- Node built-in test runner (matching existing `tests/defaults/*.test.ts` pattern)
- Single test file, no new helpers
- One happy-path run against current `.cycle/workflows.yml` — all three assertions should pass on master

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — test addition only, no convention or command change
- **README.md**: No user-facing change

## Dependencies
- `yaml` package must already be available (used throughout the project)
- `.cycle/workflows.yml` must exist at repo root (it does; restored in cycle 0047)
