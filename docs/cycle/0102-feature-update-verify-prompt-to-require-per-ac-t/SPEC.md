# SPEC — Cycle 0102: Add Per-AC Verification Gate to verify.md

## Objective
Cycle verify currently runs only `npm test`, so a green test suite counts as success even if the SPEC deliverable was never applied. This cycle adds a claudecode-driven verify prompt that checks every SPEC Acceptance Criteria bullet with a targeted assertion before allowing the test suite step to proceed, closing the long-running false-positive loop.

## Source Issue
`refl-0084-verify-step-passes-when-primary-delivera-verify-prompt-require-spec-ac` — "Update verify prompt to require per-AC targeted verification before passing"

## Scope

### In Scope
- Create `src/defaults/prompts/verify.md` — a two-phase claudecode verify prompt (Phase 1: per-AC assertion; Phase 2: test suite)
- Update `src/defaults/workflows.yml`: change every verify step from `agent: bash, command: scripts/verify.sh` to `agent: claudecode, prompt: prompts/verify.md`
- Update `.cycle/workflows.yml` identically (maintaining the existing trunk-based divergence comment and no_branch/commit-trunk.sh entries)
- Run `npm run sync-defaults` so `.cycle/prompts/verify.md` is created and byte-identical to the source

### Out of Scope
- Deleting or modifying `src/defaults/scripts/verify.sh` (other workflows or consumers may still reference it)
- Changing any other prompt files
- Adding automated tests for the prompt content itself

## Requirements
- `src/defaults/prompts/verify.md` must instruct the agent to: (1) read SPEC.md and extract every `## Acceptance Criteria` bullet, (2) run a targeted concrete command (`grep`, `stat`, `node -e`, etc.) per bullet, (3) emit `MUST-FIX` and exit non-zero if any check fails or cannot be expressed as a concrete assertion, and only then (4) run the project's test suite.
- The two phases must be labeled clearly (e.g. `## Phase 1` / `## Phase 2`) so the sequence is unambiguous.
- Both workflow files must use `agent: claudecode, prompt: prompts/verify.md` for all verify steps.
- After `npm run sync-defaults`, `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` must exit 0.
- `npm test` must pass with no regressions and coverage must not drop below the baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Acceptance Criteria
- [ ] `src/defaults/prompts/verify.md` exists and contains a section requiring per-AC targeted assertion before the test-suite step
- [ ] `src/defaults/workflows.yml` uses `agent: claudecode, prompt: prompts/verify.md` for all verify steps (not bash/verify.sh)
- [ ] `.cycle/workflows.yml` uses `agent: claudecode, prompt: prompts/verify.md` for all verify steps, with trunk-based divergence preserved
- [ ] `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` exits 0 after sync
- [ ] `npm test` passes with no regressions
- [ ] Coverage does not drop below baseline

## Testing Strategy
- No new unit tests are required (prompt files are not executable code)
- Manual verification: `grep -c 'Acceptance Criteria' src/defaults/prompts/verify.md` returns ≥ 1; `grep 'agent: claudecode' src/defaults/workflows.yml` matches the verify line
- `npm test` (434 tests, 0 failures as of baseline) must still pass
- `cmp src/defaults/prompts/verify.md .cycle/prompts/verify.md` confirms sync

## Documentation Updates
- **CLAUDE.md**: No command table changes needed; verify remains the same step name, just driven by a different agent type
- **README.md**: No user-facing change

## Dependencies
- `npm run sync-defaults` must be operational (it is — `scripts/sync-defaults.mjs` exists)
- `.cycle/workflows.yml` already exists with the trunk divergence comment that must be preserved
