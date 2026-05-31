# SPEC — Cycle 0015: Optional command-output compression for claudecode steps

## Objective
Long-running autonomous cycles spend context-window tokens on verbose, low-density command output (`git`, `ls`, `grep`, `diff`, `cat`, …) that the agent reads through Bash tool calls. This cycle delivers an **opt-in** token-saving path for `claudecode` steps: a new `cycle compress-output` filter subcommand plus a `PreToolUse` hook, registered only for the claude lane and gated behind an `engine.compress_output` config flag that defaults **off**. When enabled, simple read commands are transparently routed through the filter, which density-reduces their stdout before it enters the model's context. When disabled (the default), behavior is byte-for-byte unchanged.

## Source Issue
`feat-compress-step-output` — "Optional command-output compression for claudecode steps (token savings)"

## Scope

### In Scope
- A new `cycle compress-output -- <cmd>...` subcommand: spawns the command with array args (no shell), captures stdout/stderr, and when stdout exceeds a configurable byte threshold applies a density filter (retain head + tail lines plus all stderr/error lines, elide the dense middle with a `[… N lines/B bytes elided …]` marker); below threshold it passes output through verbatim. The child's exit code is always preserved.
- Opt-in wiring: an `engine.compress_output` config field (default `false`) that, when true, registers a `PreToolUse` hook in the **claude lane only** (`exec-claudecode.ts`, via the claude CLI settings/hook mechanism). The hook detects simple compressible read commands with no shell operators (`|`, `>`, `&&`, `;`, `$(`, backticks, etc.) and rewrites them to run through `cycle compress-output`; everything else passes through untouched.
- Tests and documentation for both pieces (subcommand filter behavior + default-off no-op wiring).

### Out of Scope
- Compression for any agent other than `claudecode` (`codex`, `gemini`, `auggie`, `opencode`, `pi`, and `bash` steps are unaffected — they have no equivalent hook mechanism here).
- Binary/gzip compression of artifacts or logs; this is a text density filter, not byte compression.
- Modifying the captured `SPEC.md`/`PLAN.md`/`BUILD.md`/… step artifacts or the `step.end` log excerpt — only the agent's *in-context* Bash tool output is affected.
- RFC-005 runtime-enforced step contracts (this cycle only lays the first `PreToolUse`-hook usage that RFC-005 may later build on).

## Requirements
- `cycle compress-output` MUST be dispatched as a CLI subcommand alongside the existing commands, using `spawn`/`spawnSync` with array args and never `shell: true` (per repo subprocess discipline).
- The density filter MUST be deterministic and MUST never drop stderr content or non-zero-exit diagnostics — error visibility is preserved even at maximum compression.
- The filter threshold and head/tail keep amounts MUST be configurable (with documented defaults), and output at or below the threshold MUST pass through unchanged.
- The child process exit code MUST propagate as the subcommand's own exit code.
- `engine.compress_output` MUST default to `false`; absent, non-boolean, or malformed values MUST be treated as `false` (disabled). With the flag off, no hook is registered and `claudecode` invocation is byte-for-byte identical to current behavior.
- The hook rewrite MUST be conservative: only allowlisted read commands with no shell metacharacters are rewritten; anything ambiguous passes through unmodified.
- The valid-agent contract and existing fleet behavior MUST remain unchanged for non-claude agents.
- **Failure behavior**: On invalid subcommand usage (no command given), the subcommand writes an error to stderr and exits non-zero without spawning anything. When the wrapped command itself fails (non-zero exit, missing binary), the subcommand preserves and surfaces the child's stderr and exit code rather than masking them. The `PreToolUse` hook MUST fail open — if the hook script errors, mis-parses, or `cycle` is not resolvable, the original command runs unchanged so a hook bug can never break a `claudecode` step (errors logged, never swallowed into a blocked tool call). A malformed `engine.compress_output` value degrades to disabled rather than throwing at config load.

## Acceptance Criteria
- [ ] Running `cycle compress-output -- git status` (or a stub command) with stdout above the threshold prints a filtered output containing the head, the tail, and an elision marker, and exits with the wrapped command's exit code.
- [ ] Running `cycle compress-output` against output below the threshold prints the output verbatim (no marker), and exits 0.
- [ ] A wrapped command that exits non-zero causes `cycle compress-output` to exit with that same non-zero code, and its stderr/error lines appear in the output (not dropped).
- [ ] With `engine.compress_output` absent or `false`, the `claudecode` invocation registers no `PreToolUse` hook — verified by an assertion that the claude argv/settings are identical to the pre-change baseline.
- [ ] **Failure-path**: invoking `cycle compress-output` with no command argument exits non-zero and writes a usage/error message to stderr while spawning nothing; and a forced hook-script failure leaves the underlying command running unmodified (fail-open), asserted by test.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner (repo convention, `--experimental-strip-types`, no transpile).
- Unit-test the density filter as a pure function: above-threshold compression (head/tail/marker shape, byte-count math), at/below-threshold passthrough, stderr/error-line retention, exit-code preservation, and the no-command usage error.
- Test the hook command-classification logic in isolation: allowlisted read commands rewrite; commands containing shell operators or non-allowlisted binaries pass through; hook-error path falls back to the original command (fail-open).
- Wiring test: assert `exec-claudecode.ts` registers the hook only when `engine.compress_output === true`, and that the default-off path produces unchanged claude invocation arguments.
- Subprocess interception uses `node:fs` / injectable spawn or `CYCLE_*_BIN`-style stub binaries (not `mock.method` on `node:fs/promises`, per test conventions).
- New files must respect coverage floors; add per-file floors for the new module(s) in `scripts/coverage-gate.mjs` consistent with existing CLI floors.
- No UI surface — no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md**: add `cycle compress-output` to the Commands table; add an `engine.compress_output` entry to the *Workflow defaults* / engine-config list (default off, claudecode-only, fail-open semantics); note in the agent/model section that the hook is claude-lane-only.
- **README.md**: surface the opt-in token-saving flag and how to enable it (`engine.compress_output: true`).
- **docs/ENGINE.md**: document the `PreToolUse` compression hook and the `compress-output` filter contract (threshold, head/tail retention, error-line preservation, exit-code propagation, fail-open behavior).
- After editing `src/defaults/`, run `npm run sync-defaults` so `.cycle/` reflects the new default config key.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing CLI dispatch in `src/cli.ts` and the agent execution module `src/engine/exec-claudecode.ts`.
- Engine config loading and the `EngineConfig` type in `src/engine/workflow.ts`, plus defaults in `src/defaults/workflows.yml`.
- The claude CLI's `--settings`/hook (`PreToolUse`) mechanism must be available in the installed `claude` binary for the wiring to take effect; when unavailable or disabled, the default-off path keeps the engine fully functional.
- `src/engine/child-env.ts` for any subprocess env construction; `src/engine/log-fmt.ts` (`truncateHeadCapped`) as a reuse candidate for the head/tail capping.
