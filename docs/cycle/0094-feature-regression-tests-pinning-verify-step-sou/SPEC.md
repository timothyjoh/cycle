`★ Insight ─────────────────────────────────────`
Cycle 0093 shipped only docs — `BUILD.md` is one line: "Need write permission". The guard never landed in `verify.sh`. This cycle inherits that gap: tests without a guard would fail on master, so the spec must bundle the guard implementation as a prerequisite alongside the integration tests.
`─────────────────────────────────────────────────`

```markdown
# SPEC — Cycle 0094: Regression Tests for verify.sh Source-Mutation Guard

## Objective
Add integration tests that pin the four behavioral cases of the source-mutation guard in `src/defaults/scripts/verify.sh`. Cycle 0093 was permission-blocked and delivered zero source changes, so this cycle must first implement the guard (a verbatim carry-forward from 0093's PLAN.md) and then add the four-case integration test suite. Together they close the false-positive drain where a cycle with only `docs/cycle/` writes passes verify.

## Source Issue
`refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-test` — "Regression tests pinning verify step source-mutation guard"

## Scope

### In Scope
- Insert the `CYCLE_BASE` mutation guard into `src/defaults/scripts/verify.sh` (carries 0093 PLAN Task 1 verbatim, since 0093 was blocked)
- Sync to `.cycle/scripts/verify.sh` via `npm run sync-defaults`
- Create `tests/defaults/verify.test.ts` with four integration tests exercising exit-code behavior: only-docs-cycle-paths, mixed-paths, no-changes, only-src-paths

### Out of Scope
- Modifying the test-runner dispatch block in `verify.sh`
- Adding E2E tests for the full workflow
- Extracting shared helpers (`makeRepo`/`runScript`) — `refl-0068` (shared helpers) is not yet done; define helpers locally in the new test file following the `commit_sh.test.ts` pattern
- Adding a byte-identical assertion test for the `src/defaults` → `.cycle/` sync pair

## Requirements
- The guard must use `BASE="${CYCLE_BASE:-master}"` and `git diff --name-only "$BASE"...HEAD | grep -qv '^docs/cycle/'` as the gate expression
- On empty diff or all-`docs/cycle/` diff: exit 1 with a stderr message containing "no src changes"
- On any non-`docs/cycle/` path present: exit 0 and fall through to the test-runner dispatch block
- Integration tests must create isolated `mkdtemp` git repos, set `CYCLE_BASE` to the base commit SHA, invoke `verify.sh` via `spawnSync("bash", [".cycle/scripts/verify.sh"])`, and assert `r.status`
- Static body-pattern assertions covering the guard must be added to `tests/defaults/scripts.test.ts`

## Acceptance Criteria
- [ ] `src/defaults/scripts/verify.sh` contains `BASE="${CYCLE_BASE:-master}"` and the `grep -qv '^docs/cycle/'` guard block before the `if [ -f package.json ]` dispatch
- [ ] `src/defaults/scripts/verify.sh` and `.cycle/scripts/verify.sh` are byte-identical after `npm run sync-defaults`
- [ ] `tests/defaults/verify.test.ts` exists and covers all four cases with explicit `assert.equal(r.status, <N>)` assertions:
  - only `docs/cycle/` changes → exits 1
  - mixed `docs/cycle/` + `src/` changes → exits 0
  - no changes at all → exits 1
  - only `src/` changes → exits 0
- [ ] `tests/defaults/scripts.test.ts` has at least two new static assertions: guard pattern present and `CYCLE_BASE:-master` fallback present
- [ ] All existing 434+ tests still pass (`npm test` exits 0)
- [ ] No compiler/linter warnings (`npm run typecheck` exits 0)
- [ ] Coverage baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) not decreased

## Testing Strategy
- Node native test runner (`node:test`) — same as all other `tests/defaults/` files
- Each integration test: `mkdtemp` → `git init` + configure → seed commit → make base commit → `CYCLE_BASE=<base-sha>` → run `verify.sh` → assert exit code
- Copy `src/defaults/scripts/verify.sh` into `.cycle/scripts/verify.sh` inside the temp repo (same pattern as `commit_sh.test.ts` copying `commit.sh`)
- Four tests cover the happy path (mixed, src-only) and failure path (docs-only, empty-diff)
- Two additional static assertions appended to `tests/defaults/scripts.test.ts` pin the guard text patterns

## Documentation Updates
- **CLAUDE.md**: No convention changes; verify.sh behavior change is self-documenting via test
- **README.md**: No user-facing change required — the guard is an engine-internal safety check

## Dependencies
- `src/defaults/scripts/verify.sh` must be writable (write permission approved — cycle 0093 was blocked here; this cycle assumes permission is now available)
- `CYCLE_BASE` env var is already injected by the engine (`run-cycle.ts:127`); the `:-master` fallback handles standalone invocation
- `mkdtemp`, `spawnSync`, `git` available in the test environment (same as `commit_sh.test.ts`)
```
