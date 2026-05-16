# SPEC — Cycle 0083: Fix exec-claudecode.ts: add --dangerously-skip-permissions to unblock build steps

## Objective
Add `--dangerously-skip-permissions` to the `claude` CLI invocation in `src/engine/exec-claudecode.ts` so that engine-spawned `claude -p` subprocesses can perform Write/Edit operations without interactive permission prompts. This unblocks all future feature cycle build steps, which have been silently failing and producing placeholder artifacts since the local `settings.local.json` overrides (rather than merges with) global write permissions.

## Source Issue
`refl-0082-settings-local-json-overrides-global-wri` — "Fix exec-claudecode.ts: add --dangerously-skip-permissions to unblock build steps"

## Scope

### In Scope
- Add `--dangerously-skip-permissions` flag to the `spawn("claude", ...)` args array in `src/engine/exec-claudecode.ts`
- Update any existing tests that assert on the exact args shape to include the new flag

### Out of Scope
- Modifying `settings.local.json` (option a — rejected; engine-level fix is preferred)
- Any other exec modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-bash.ts`)
- Changes to the permissions model or Claude settings structure

## Requirements
- `--dangerously-skip-permissions` must appear in the `claude` CLI args, positioned before the prompt string (`-p <prompt>`)
- Existing subprocess discipline must be preserved: `spawn` with array args, no `shell: true`
- `npm test` must pass with no regressions

## Acceptance Criteria
- [ ] `--dangerously-skip-permissions` appears in the args array in `src/engine/exec-claudecode.ts`, before `-p`
- [ ] `npm test` passes with no regressions
- [ ] Any test that asserts on the exact exec-claudecode args shape includes the new flag

## Testing Strategy
- Node native test runner (`npm test`)
- Grep tests directory for any stubs or fixtures referencing the `claude` CLI args in exec-claudecode context and verify/update them
- No new tests required for this change — the existing suite confirms no regressions; the acceptance criteria are verifiable by code inspection + test pass

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — this is an internal engine fix with no user-facing convention change
- **README.md**: No changes — internal engine behavior, not surfaced to operators

## Dependencies
- `src/engine/exec-claudecode.ts` must be the authoritative spawn site for `claude -p` invocations (confirmed: it is the only caller)
- No external services or env vars required
