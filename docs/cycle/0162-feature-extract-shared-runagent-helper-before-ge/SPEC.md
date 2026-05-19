# SPEC — Cycle 0162: Extract Shared runAgent Helper

## Objective
Extract a shared `runAgent` helper into `src/engine/exec-spawn.ts`, then reduce `exec-codex.ts` and `exec-claudecode.ts` to thin config-plus-delegation wrappers. This eliminates the current ~95% code duplication between the two provider modules and prevents a third copy landing with the upcoming Gemini provider. Observable behavior is preserved exactly; only internal structure changes.

## Source Issue
`refl-0030-exec-provider-modules-converging-on-copy` — "Extract shared runAgent helper before Gemini lands to stop exec-provider copy-paste"

## Scope

### In Scope
- New `src/engine/exec-spawn.ts` exporting `runAgent({ binary, argv, promptDelivery, promptPath, repoRoot, signal? })`
- Shrink `exec-codex.ts` and `exec-claudecode.ts` to config + single `runAgent(...)` call
- New `tests/engine/exec-spawn.test.ts` covering both delivery modes, ENOENT, non-zero exit + stderr capture

### Out of Scope
- Gemini provider module (`multi-agent-abstraction-exec-gemini`)
- `ExecModule` `promptPath` → `prompt: string` contract redesign (`refl-0029`)
- Any change to the `ExecModule` interface or registry contract in `exec.ts`
- Dead-code stdin try/catch cleanup (`refl-0030-exec-codex-defensive-stdin-catch-is-dead-code`) — removed in cycle 0161; already done

## Requirements
- `runAgent` preserves prompt resolution: `readFile(join(repoRoot, '.cycle', promptPath))`
- Spawn discipline: array args, no `shell: true`, curated PATH via `child-env.ts`
- stdin delivery path: write prompt then end stream; maintain ENOENT-stdin race guard (error listener on `stdin`)
- argv delivery path: pass resolved prompt string as final positional arg
- stdout/stderr capture: head-cap stderr, full stdout buffer
- Exit semantics: `StepResult { status: 'ok' | 'failed', stdout, stderr_excerpt?, error? }` unchanged
- `exec-codex.ts` and `exec-claudecode.ts` must each fit on a screen after refactor
- `exec.ts` registry imports updated if module shape changes; registry contract and `ExecModule` interface untouched

## Acceptance Criteria
- [ ] `src/engine/exec-spawn.ts` exists and exports `runAgent` with documented signature
- [ ] `exec-codex.ts` contains only config + one `runAgent(...)` call (fits on screen)
- [ ] `exec-claudecode.ts` contains only config + one `runAgent(...)` call (fits on screen)
- [ ] `tests/engine/exec-spawn.test.ts` covers: argv delivery, stdin delivery, ENOENT exit, non-zero exit with stderr capture
- [ ] All existing `exec-codex.test.ts` and `exec-claudecode.test.ts` tests pass without behavioral change
- [ ] `npm test` green
- [ ] `npm run typecheck` zero errors
- [ ] `npm run test:coverage` green; line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors held
- [ ] BUILD.md reports line/branch/func coverage numbers

## Testing Strategy
- Framework: Node's built-in test runner (project convention)
- `tests/engine/exec-spawn.test.ts`: mock `child_process.spawn` to test both `promptDelivery: "argv"` and `promptDelivery: "stdin"` paths; simulate ENOENT via `child.on('error')` callback; simulate non-zero exit + stderr to verify `stderr_excerpt` truncation behavior
- Existing `exec-codex.test.ts` and `exec-claudecode.test.ts`: must remain green unchanged — they test the public behavior contract, which is preserved
- No E2E tests required (no UI change)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes; `exec-spawn.ts` is an internal module. No update needed.
- **README.md**: No user-facing change.
- **BUILD.md**: Must include coverage line/branch/func numbers per project policy.

## Dependencies
- `src/engine/child-env.ts` — already exists; `runAgent` will import from it
- `src/engine/log-fmt.ts` — `truncateHeadCapped` for stderr head-cap; already used by existing exec modules
- `StepResult` type — defined in existing exec modules or shared types; confirm location before writing
