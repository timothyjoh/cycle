## Summary

This cycle introduced a single resolvable shell abstraction (`src/engine/shell.ts`, 64 lines, new) that replaces the two hard-coded `/bin/bash` spawn sites, so `agent: bash` steps and the walkthrough hook run on native-Windows PowerShell hosts (via discovered git-bash / WSL bash) while Linux/macOS behavior is preserved byte-for-byte. The module exports a pure, injectable `resolveShell({ platform, env, config, existsSync })` returning a `ShellResolution` discriminated union, the ordered `WINDOWS_SHELL_CANDIDATES` probe list, and `POSIX_DEFAULT_SHELL`; resolution precedence is exactly `engine.shell` config (verbatim, no existence check) → `CYCLE_SHELL` env (verbatim) → platform auto-discovery (POSIX `/bin/bash`; Windows first-existing candidate) → a structured `{ ok: false, searched, message }` whose message names the searched paths and remediation. It never spawns and never throws.

All five PLAN.md tasks are complete: **Task 1** `resolveShell` (`src/engine/shell.ts`); **Task 2** `engine.shell` config plumbing in `src/engine/workflow.ts` (optional `shell?: string`, normalized to unset when absent/empty/non-string at `loadConfig`); **Task 3** `execBashStep` rewire (`src/engine/exec-bash.ts`, 49 lines) — optional defaulting `ShellResolution` param, unresolved-shell short-circuit to a failed `StepResult` without spawning, and a new `child.on("error", …)` handler converting a configured-but-missing shell path into `status:"failed"`/`exitCode:-1` instead of an unhandled `ENOENT`; **Task 4** `execWalkthroughHook` rewire (`src/engine/walkthrough.ts`) with the same optional param and pre-spawn unresolved short-circuit (no timer armed), plus `run-cycle.ts` resolving once per spawn site and threading `cfg.engine.shell` into both lanes; **Task 5** docs (CLAUDE.md, docs/ENGINE.md *Shell resolution* subsection, README.md one-line note) and coverage floors (`scripts/coverage-gate.mjs`: `shell.ts` 100, `exec-bash.ts` 90).

**Test suite:** `npm test` → `tests 1032 / pass 1032 / fail 0`. **Coverage:** `npm run test:coverage` (which chains `check:coverage` + `check:invariants`) exits 0; every per-file floor passes, including the two new floors `src/engine/shell.ts` 100.00% ≥ 100% and `src/engine/exec-bash.ts` 100.00% ≥ 90% (exec-bash reached 100%, above its 90% floor). `npm run typecheck` is clean (no warnings). No per-file regressions.

**Failure modes handled and their tests:** (1) Windows-unresolved — `resolveShell` returns the typed `{ ok:false, searched, message }` and `execBashStep` resolves `status:"failed"`, `exitCode:1`, with `stderr` naming the searched git-bash/WSL paths plus the `engine.shell`/`CYCLE_SHELL` remediation, never throwing (covered in `tests/engine/shell.test.ts` and the Windows-unresolved case in `tests/engine/exec-bash.test.ts`). (2) Configured-but-missing shell path — the new spawn-`error` handler resolves `status:"failed"`/`exitCode:-1` rather than rejecting (covered by the `/nonexistent` shell case in `exec-bash.test.ts`). (3) Walkthrough unresolved shell — `execWalkthroughHook` resolves a failed `StepResult` with the message and arms no timer, routing through the existing fatal step-failure path (covered by "execWalkthroughHook resolves a failed StepResult on an unresolved shell without arming a timer" in `walkthrough.test.ts`). (4) Config normalization — non-string `engine.shell` drops to unset at load, never throws (covered in `workflow.test.ts`). Idempotency is preserved: the unresolved branches spawn nothing (trivially re-run-safe) and failed steps route through the unchanged `max_cycle_attempts` retry / `max_consecutive_failures` accounting. No errors are silently swallowed — every branch resolves an explicit `StepResult`.

**Deviations from PLAN.md:** none. The local resolution variables in `run-cycle.ts` are named `wtShell` (walkthrough site) and `bashShell` (bash site) rather than a shared `shell` identifier, an inconsequential naming choice to avoid shadowing; behavior matches the plan.

**Deferred / follow-up:** Out-of-scope items per SPEC remain deferred to Phase 3 — a native `pwsh`/PowerShell step type, the cross-platform setup guide, the path-separator / line-ending audit, and a per-step `shell:` override. No new follow-up work was discovered.

## Touched Files
- src/engine/shell.ts
- tests/engine/shell.test.ts
- src/engine/exec-bash.ts
- tests/engine/exec-bash.test.ts
- src/engine/walkthrough.ts
- tests/engine/walkthrough.test.ts
- src/engine/run-cycle.ts
- src/engine/workflow.ts
- tests/engine/workflow.test.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
- docs/runtime-environment.md
