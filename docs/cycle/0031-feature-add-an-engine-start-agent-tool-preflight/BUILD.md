## Summary

This cycle was a re-queue (`txt-20260602-233001-preflight-gate-requeue`); the prior overnight attempt produced the implementation but failed on environment-only issues. All four PLAN.md tasks are complete and verified green on this machine — no further code changes were required beyond confirming the existing implementation builds, passes, and meets every gate.

**What exists / was verified.** The engine-start preflight gate is fully in place: `src/engine/preflight.ts` (255 lines, new) exporting `runPreflight(opts)` with the `PreflightResult`/`PreflightCheck`/`PreflightFailure`/`PreflightWarning` types, the `AGENT_BINARY` mirror table, `resolveOnPath`/`distinctAgents`/`detectTools`/`isWsl`/`agentFix`/`shadowWarning` helpers, and the defensive outer `try/catch` that converts any internal error into a single `internal` failure. The module adds one seam beyond PLAN (`pathEnv`, default `buildChildEnv({}).PATH`) so the missing-tool failure path can be tested hermetically without PATH-stubbing real agent names — `buildChildEnv` unconditionally prepends node's bin dir, which would otherwise mask `git`/`bash`. `src/cli/parse-args.ts` (67 lines) carries the `--skip-preflight` flag (`RunArgs.skipPreflight`, options map, returned object). `src/cli.ts` runs the gate between `engine.start` and the triage block, guarded by `if (cfg && !args.skipPreflight)`: one `engine.preflight.warning` per warning, then on failure `engine.preflight.failed { failures }` + `engine.stop { reason: "preflight_failed" }` + `process.exit(1)` before any `cycle.start`, else exactly one `engine.preflight.ok { checks }`. `scripts/coverage-gate.mjs` registers the `src/engine/preflight.ts: 95` floor. Docs are updated: CLAUDE.md (Architecture + Workflow-defaults), `docs/ENGINE.md` (*Preflight gate* section), and README.md (user-facing run description + `--skip-preflight`). `src/defaults/` is untouched, so `sync-defaults` was correctly not required.

**Tasks complete.** Task 1 (`--skip-preflight` flag), Task 2 (`preflight.ts` module), Task 3 (`cli.ts` wiring + events + halt), Task 4 (coverage floor + docs) — all done. All eight SPEC acceptance bullets are covered by tests.

**Test command and result.** `npm run test:coverage` (runs `pretest` build → full `node --experimental-strip-types` suite → `check:coverage` → `check:invariants`) — exit code 0, all tests pass, no failures. `npm run typecheck` (`tsc --noEmit`) — clean, no warnings.

**Coverage.** Per-file gate via `scripts/coverage-gate.mjs`: every floor met, including `src/engine/preflight.ts` at **99.22% ≥ 95%**. Aggregate over `src/` + `scripts/` (excluding the `dist/` bundle): **Line 99.06%, Branch 93.10%, Function 93.52%** — all above policy floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%); no per-file regression. All structural invariants pass.

**Failure modes handled and their tests.** (a) *Unresolved agent binary* — bare name not on PATH ⇒ recorded `agent` failure with `resolvedPath:null` and an env-var fix, never a throw (`unresolved bare-name agent … fails with env-var fix`). (b) *Missing override path* ⇒ failure reporting the override path (`missing agent binary (nonexistent override path)`). (c) *Wrong-platform agent* — `--version` probe exits non-zero ⇒ failure with resolved path + install fix; under `shadowPrefix` the SPEC-mandated "a Windows build missing the linux-x64 binary" wording, generic probe-failed wording otherwise (two tests). (d) *Missing required tool* — empty `pathEnv` ⇒ `git` tool failure with actionable fix (`missing required tool`). (e) *`/proc/version` missing/unreadable* ⇒ `readProcVersion` returns `null` ⇒ not-WSL, no warning, no crash (covered via injected `procVersion`). (f) *Unresolved workflow* ⇒ degrades to triage agent + `bash`/`git` only (`unresolved workflow degrades…`). (g) *Internal error* ⇒ outer catch surfaces a single `internal` failure carrying the message, no raw stack trace (`internal error is caught and surfaced…`). (h) *WSL shadow* — injected `procVersion`/`shadowPrefix` yield exactly one non-fatal `wsl_shadow` warning while `ok` stays `true` (agent + tool variants). Idempotency: the gate is read-only (no writes, no state mutation) and safe to re-run on retry/restart with identical results. At the CLI level: `missing agent binary halts before any cycle.start, exit 1`, `--skip-preflight emits neither preflight event`, and `healthy env emits exactly one engine.preflight.ok` (cardinality-pinned).

**Deviations from PLAN.** One additive seam: the `pathEnv` option on `PreflightOpts` (not in the original PLAN signature), introduced so the missing-tool scenario is hermetic given `buildChildEnv`'s unconditional node-bin-dir PATH prepend. Probes still spawn the resolved absolute path under `buildChildEnv({})` regardless, so behavior on the real path is unchanged. No other deviations.

**Deferred / follow-up.** `AGENT_BINARY` remains a manual mirror of the exec-lane fleet (no structural invariant — out of scope per PLAN); the manual-sync requirement is documented in CLAUDE.md alongside the existing fleet-consistency note. A new agent added to `REGISTRY` without an `AGENT_BINARY` entry surfaces loudly as an `internal` failure rather than a silent skip.

## Touched Files
- src/engine/preflight.ts
- src/cli.ts
- src/cli/parse-args.ts
- scripts/coverage-gate.mjs
- CLAUDE.md
- docs/ENGINE.md
- README.md
- tests/engine/preflight.test.ts
- tests/cli/preflight.test.ts
- tests/cli/parse-args.test.ts
- tests/cli/engine-lock-integration.test.ts
- tests/scripts/coverage-gate.test.ts
