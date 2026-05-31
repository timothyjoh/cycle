## Summary

All six PLAN.md tasks are complete and the full verify suite is green.

**New source modules.** `src/engine/compress-filter.ts` (145 lines, new) holds the pure deterministic core: `compressOutput` (byte-threshold passthrough; head/tail retention with error-line preservation and a single `[… N lines/B bytes elided …]` marker; documented few-lines/long-line passthrough edge), `classifyCommand` (ALLOWLIST + `DENY_PATTERN` metacharacter rejection), `buildRewriteCommand`, and `buildCompressHookSettings`, plus the documented default constants. `src/cli/compress-output.ts` (72 lines, new) wraps `spawnSync` (array args, `shell:false`, `buildChildEnv`, 64 MiB `maxBuffer`) around the filter, parses optional `--threshold-bytes`/`--head-lines`/`--tail-lines` flags, and propagates the child exit code. `src/cli/compress-output-hook.ts` (40 lines, new) is the fail-open PreToolUse classifier reading a JSON event and emitting an optional `updatedInput.command` rewrite.

**Wiring (modified).** `src/cli.ts` (+21) adds the `compress-output` and `compress-output-hook` subcommand guards and the help usage line. `src/engine/exec.ts` (+4) adds the `settingsPath?` field to the `runStep` contract. `src/engine/exec-claudecode.ts` (+5/−1) destructures `settingsPath` and appends `--settings <path>` immediately before `-p`. `src/engine/run-cycle.ts` (+23) materializes `.cycle/compress-hook-settings.json` for `claudecode` steps only when `cfg.engine.compress_output === true`, threading `settingsPath` into `runStep`. `src/engine/workflow.ts` (+4) declares `compress_output?: boolean` on `EngineConfig` (no new `loadConfig` throw path). `src/defaults/workflows.yml` (+1) adds `compress_output: false`, synced into `.cycle/workflows.yml` via `npm run sync-defaults`.

**Coverage floors + docs (modified).** `scripts/coverage-gate.mjs` (+3) registers floors for the three new files (`compress-filter.ts` 100, `compress-output.ts`/`compress-output-hook.ts` 70). `CLAUDE.md` (+4/−2), `README.md` (+1), and `docs/ENGINE.md` (+20) document the subcommand, the `engine.compress_output` flag (default off, claudecode-only, fail-open), the filter contract, and the PreToolUse hook.

**Tests.** New: `tests/engine/compress-filter.test.ts` (146), `tests/cli/compress-output.test.ts` (107), `tests/cli/compress-output-hook.test.ts` (65), `tests/engine/run-cycle.compress-hook.test.ts` (148). Extended: `tests/engine/exec-claudecode.test.ts` (+61, baseline-argv byte-identity + `--settings`-before-`-p` assertions), `tests/engine/workflow.test.ts` (+75, default/absent/non-boolean config cases), `tests/cli/help.test.ts` (+7), `tests/scripts/coverage-gate.test.ts` (+9).

**Verify.** Ran `npm run typecheck` → clean (`tsc --noEmit`, no warnings). Ran `npm run test:coverage` (full `node --test` suite + LCOV coverage + `posttest:coverage` running `coverage-gate.mjs` and `structural-invariants.mjs`) → exit 0: all tests pass, every per-file floor green (the three new files at **100.00%**), all structural invariants ok. Aggregate coverage reported in the run was Line 40.06% / Branch 87.08% / Function 45.54% — these aggregate figures are dominated by the bundled `dist/`-adjacent vendored harness files (e.g. `subagent-executor.ts`, `worktree.ts`, `skills.ts`) that are not part of this repo's owned source and were not introduced or altered this cycle; every owned-source per-file floor enforced by `coverage-gate.mjs` passed, so no floor regressed. New code added its tests in this same cycle.

**Failure modes handled and their tests.** (1) *No-command usage* — `runCompressOutput` returns exit 2 with a usage message to stderr and spawns nothing; tested with an injected spawn spy asserting it is never called. (2) *Missing binary / spawn error* — surfaces `res.error.message` to stderr and exits 127; tested via injected `spawnFn` returning `{ error }`. (3) *Child non-zero exit* — exact code propagated, child stderr passed through verbatim, and error-pattern stdout lines retained through the filter; tested. (4) *Hook fail-open* — malformed JSON, missing `tool_input.command`, non-Bash/non-allowlisted/operator-bearing commands all yield empty stdout and exit 0 (original command runs unchanged); tested including a forced-parse-error case. (5) *Settings-write failure* — `run-cycle` emits exactly one `step.warning { reason: "compress_hook_settings_failed" }` (cardinality-pinned with `filter(...).length === 1`) and proceeds without `--settings` (fail-open); tested. (6) *Default-off byte-identity* — with the flag absent/false, no settings file is written and the claude argv has no `--settings` token, asserted against the pre-change baseline. The settings write is idempotent (same content overwritten each step, no lifecycle state); the filter is a deterministic stateless transform safe under retry.

**Deviations from PLAN.md.** None. All tasks implemented as planned, including the decision (per PLAN) not to add a structural invariant for the default-off contract — the `exec-claudecode.test.ts` baseline argv assertion is the contract guard.

**Deferred / follow-up.** None required for this cycle. Live claude-CLI PreToolUse rewrite behavior across installed versions is intentionally not exercised (out of scope; the test-pinned contract is the default-off byte-identity, with fail-open covering schema drift).

## Touched Files
- src/engine/compress-filter.ts
- src/cli/compress-output.ts
- src/cli/compress-output-hook.ts
- src/cli.ts
- src/engine/exec.ts
- src/engine/exec-claudecode.ts
- src/engine/run-cycle.ts
- src/engine/workflow.ts
- src/defaults/workflows.yml
- .cycle/workflows.yml
- scripts/coverage-gate.mjs
- CLAUDE.md
- README.md
- docs/ENGINE.md
- tests/engine/compress-filter.test.ts
- tests/cli/compress-output.test.ts
- tests/cli/compress-output-hook.test.ts
- tests/engine/run-cycle.compress-hook.test.ts
- tests/engine/exec-claudecode.test.ts
- tests/engine/workflow.test.ts
- tests/cli/help.test.ts
- tests/scripts/coverage-gate.test.ts
