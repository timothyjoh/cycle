# Research: Cycle 0047

## Cycle Context
SPEC 0047 (source issue `refl-0024-walkthrough-hook-spawn-has-no-timeout-ca`) asks to give `execWalkthroughHook` (`src/engine/walkthrough.ts`) the same bounded-kill semantics as `exec-spawn.ts`: arm a config-gated, injectable timeout on spawn that escalates SIGTERM→SIGKILL, marks the result `timedOut: true`, and routes the timed-out hook through the existing fatal step-failure path with timeout-specific wording — eliminating the indefinite-hang failure mode while preserving the non-timeout success path byte-for-byte, gated on a new defensively-read `engine.walkthrough_hook_timeout_ms` config and documented in `docs/ENGINE.md` / `CLAUDE.md`. **This work is already fully present in HEAD** (introduced via the pickaxe-traced commit `331a675` "cycle 0026"), so the cycle is a no-op (`reason: already-satisfied`); see `NOOP.md` in this artifact dir.

## Current Codebase State

### Relevant Components
- Walkthrough hook spawn + bounded-kill: `execWalkthroughHook` accepts `{ timeoutMs?, timer?, shell? }`, spawns `detached: true`, and on a positive `timeoutMs` arms the SIGTERM→SIGKILL escalation — `src/engine/walkthrough.ts:77`–`137`.
- Grace + recommended-default constants: `WALKTHROUGH_KILL_GRACE_MS = 5_000` (`src/engine/walkthrough.ts:23`) and `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS = 600_000` (`src/engine/walkthrough.ts:27`).
- Injectable timer seam: `WalkthroughTimer` type + `defaultTimer` (real `setTimeout` that `.unref()`s) — `src/engine/walkthrough.ts:33`–`38`; injected via `opts.timer` at `src/engine/walkthrough.ts:107`.
- Process-group kill: `killTree(sig)` signals `-child.pid`, falling back to `child.kill` — `src/engine/walkthrough.ts:119`–`122`.
- Single-resolve guard: `settled` flag in `done()` prevents timeout + `close`/`error` double-resolution — `src/engine/walkthrough.ts:106`,`110`–`116`.
- Timeout-marked close path: `child.on("close", …)` returns `{ status: "failed", …, timedOut: true }` when `timedOut` — `src/engine/walkthrough.ts:126`–`128`.
- Engine read-site + routing: `WALKTHROUGH_PHASES`-gated intercept in `runCycle` reads `cfg.engine.walkthrough_hook_timeout_ms`, coerces it, passes `timeoutMs`, and routes a `timedOut` failure through `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }` → early return — `src/engine/run-cycle.ts:494`–`537`.
- Timeout-specific stderr formatter: `formatWalkthroughTimeoutError(stepName, exitCode)` — `src/engine/run-cycle.ts:323`, applied at `src/engine/run-cycle.ts:526`.
- Config field: `walkthrough_hook_timeout_ms?: number` on the engine config block — `src/engine/workflow.ts:60` (alongside `walkthrough_hook?: string` at `src/engine/workflow.ts:54`).

### Existing Patterns to Follow
- Defensive read-site coercion (mirrors `max_rate_limit_retries`): a value is honored only when `typeof === "number" && Number.isInteger(...) && > 0`, else `0` (disabled) — `src/engine/run-cycle.ts:513`–`516`.
- Reference escalation implementation: the SIGTERM→SIGKILL timer pattern in `src/engine/exec-spawn.ts` (the SPEC's named reference) — mirrored by `walkthrough.ts`.
- Failure handling: an unresolved shell, spawn `error`, or non-zero `close` all resolve to a `{ status: "failed" }` `StepResult` rather than rejecting — `src/engine/walkthrough.ts:91`–`92`,`125`,`126`–`128`; a timed-out hook is a hard failure routed through the fatal path (no `step.timeout_salvaged` analog) — `src/engine/run-cycle.ts:524`–`537`.
- Observability: structured events via `log.emit` to `.cycle/log.jsonl` — `step.start` / `step.end { status, exit_code, stderr, duration_ms }` / `cycle.end { status, failing_step }` and the best-effort `step.walkthrough_capture_failed` degrade event — `src/engine/run-cycle.ts:507`,`528`–`537`,`546`–`560`.
- Idempotency / retry-safety: the `settled` single-resolve guard (`src/engine/walkthrough.ts:110`–`116`) and `detached: true` process-group ownership (`src/engine/walkthrough.ts:101`) ensure the kill reaches grandchildren and the promise resolves exactly once.
- Re-injection contract: `CYCLE_ARTIFACT_DIR` (+ conditional `CYCLE_WALKTHROUGH_PHASE`) re-injected via the `extra` arg into `buildChildEnv` — `src/engine/run-cycle.ts:521`; array args / `shell:false` preserved — `src/engine/walkthrough.ts:97`–`102`.

### Dependencies & Integration Points
- `resolveWalkthroughHook` / `collectWalkthroughMedia` / `writeWalkthroughManifest` / `walkthroughManifestName` — `src/engine/walkthrough.ts`.
- `WALKTHROUGH_PHASES` name-keyed intercept — `src/engine/run-cycle.ts:49`,`494`.
- `loadConfig` parse of the `engine.*` block (field typed at `src/engine/workflow.ts:60`).
- `resolveShell` (`src/engine/shell.ts`) and `buildChildEnv` (`src/engine/child-env.ts`).
- `StepResult` shape — `src/engine/exec-types.ts`.

### Test Infrastructure
- Test framework: `node:test` (no transpile step).
- Test conventions: per-area files under `tests/engine/`; injectable `timer` fake driving expiry deterministically (no wall-clock).
- Failure-path test coverage (already present):
  - SIGTERM→SIGKILL escalation + `timedOut/failed` resolution — `tests/engine/walkthrough.test.ts:229`.
  - Timer-armed-but-clean-exit (no `timedOut`, no kill) — `tests/engine/walkthrough.test.ts:210`.
  - Disabled-guard (`timeoutMs: 0` / omitted arms no timer) — `tests/engine/walkthrough.test.ts:260`.
  - Stale timeout/grace callbacks after `close` (single-resolve guard) — `tests/engine/walkthrough.test.ts:291`.
  - Engine-level routing of a timed-out hook to `cycle.end { failing_step }` — `tests/engine/run-cycle.walkthrough.test.ts`.
- Coverage floor: `src/engine/walkthrough.ts` carries a 95% per-file floor (CLAUDE.md coverage policy).

## Code References
- `src/engine/walkthrough.ts:77` — `execWalkthroughHook` with timeout opts, detached spawn, SIGTERM→SIGKILL bounded-kill, single-resolve guard.
- `src/engine/walkthrough.ts:23`,`27`,`33` — `WALKTHROUGH_KILL_GRACE_MS`, `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS`, `WalkthroughTimer` seam.
- `src/engine/run-cycle.ts:513` — defensive read of `engine.walkthrough_hook_timeout_ms`.
- `src/engine/run-cycle.ts:524` — `timedOut` failure routed to fatal `step.end`/`cycle.end` path.
- `src/engine/run-cycle.ts:323` — `formatWalkthroughTimeoutError`.
- `src/engine/workflow.ts:60` — `walkthrough_hook_timeout_ms?: number` config field.
- `docs/ENGINE.md:273` — *Walkthrough capture* → *Bounded-kill timeout* documentation.
- `tests/engine/walkthrough.test.ts:229`,`260`,`291` — timeout, disabled-guard, single-resolve tests.

## Open Questions
None. Every SPEC requirement and acceptance criterion — bounded-kill timeout, injectable timer, defensive config read, fatal-path routing with timeout-specific stderr, preserved success path, documentation in `docs/ENGINE.md` and `CLAUDE.md`, and the 95% coverage floor — is already implemented, wired, documented, and tested in HEAD. No code change is warranted; the cycle is signalled as a no-op (`reason: already-satisfied`) via `NOOP.md`.
