# Implementation Plan: Cycle 0031

## Overview
Add an engine-start preflight gate (`src/engine/preflight.ts`) that, after lock acquisition and config load but before triage and the first cycle, probes every agent CLI the active workflow + triage will use and every statically-required external tool, warns on WSL `/mnt/c` shadowing, and on any failure emits a cardinality-pinned `engine.preflight.failed` + a clean `engine.stop { reason: "preflight_failed" }` and exits non-zero before any `cycle.start` — with a `--skip-preflight` opt-out.

## Current State (from Research)
- **Agent registry**: `REGISTRY`/`knownAgents()` in `src/engine/exec.ts:45-56`; keys `auggie|claudecode|codex|gemini|opencode|pi` (`bash` dispatched separately).
- **Per-lane binary resolution** to mirror: each lane reads `process.env.CYCLE_<AGENT>_BIN ?? "<binary>"` — and for `claudecode` the env-stem and binary differ (`CYCLE_CLAUDE_BIN ?? "claude"`, `exec-claudecode.ts:26`); the rest are name-identical (`exec-codex.ts:14`, `exec-gemini.ts:14`, `exec-auggie.ts:10`, `exec-opencode.ts:15`, `exec-pi.ts:11`).
- **Subprocess env**: `buildChildEnv(extra)` (`src/engine/child-env.ts`) strips `CYCLE_*`, prepends parent-Node bin dir to PATH, overlays `extra`. Probes must spawn under this env with `spawnSync`, array args, `shell:false`.
- **Startup wiring point** (`src/cli.ts`): lock (180) → logger (189) → dirs (206-207) → dotenv/`loadConfig` (210-211) → `engine.start` (217) → triage block `if (cfg)` (219-230) → drain loop. The gate slots **between 217 and 219**. `args` parsed earlier; `args.workflow` defaults to `feature`.
- **Halt-via-stop pattern**: triage-failed emits `engine.stop { status:"halted", dry_run:false, cycles_processed:0, reason:"triage_failed" }` then `process.exit(1)` (`src/cli.ts:221-229`) — the shape to mirror for `preflight_failed`.
- **Config model**: `loadConfig` resolves `defaults` so every `step.agent` is concrete (`workflow.ts:136-153`); `cfg.triage.agent` is a string (`workflow.ts:62-66`, shipped value `claudecode`). `Workflow.steps[].command` carries bash-step commands.
- **Events / cardinality**: `log.emit(event, fields)` snake_case JSONL; exactly-once asserted via `filter(...).length === 1` / `expectExactlyOne` (`tests/helpers.ts:3-10`).
- **Test conventions**: temp-dir fake `#!/bin/bash` binaries `chmod 0o755`, injected via `CYCLE_<AGENT>_BIN` in `try/finally` (`tests/engine/exec-codex.test.ts:16-43`); CLI harness spawns built `dist/cycle.js` against a bootstrapped temp repo (`tests/cli/halt.test.ts:10-42`). Hermeticity invariants ban PATH-stubbing real agent names in node's bin dir — inject via `CYCLE_<AGENT>_BIN` instead.

## Desired End State
- `src/engine/preflight.ts` exports `runPreflight(opts)` returning a structured `PreflightResult { ok, checks, failures, warnings }`.
- `src/cli.ts` runs the gate (unless `args.skipPreflight`) after `engine.start`, before triage: clean pass ⇒ one `engine.preflight.ok`; any failure ⇒ one `engine.preflight.failed { failures }` + `engine.stop { reason:"preflight_failed" }` + `process.exit(1)` before any `cycle.start`.
- `--skip-preflight` bypasses the gate; neither preflight event fires.
- `tests/engine/preflight.test.ts` and a CLI-level assertion cover all five scenarios; new coverage floor for `src/engine/preflight.ts`; CLAUDE.md / docs/ENGINE.md / README.md updated.
- Verify: `npm run test:coverage` (incl. `check:coverage`, `check:invariants`) and `npm run typecheck` clean; the new tests pass.

## What We're NOT Doing
- No shell abstraction (cross-platform P2) and no broad cross-platform setup docs (P3) beyond this gate's doc edits.
- No auto-install/auto-fix/auto-switch of binaries — diagnose-and-halt only.
- No execution or deep parsing of bash-step script *contents*; tool detection is static (`bash`, `git`, plus bare-name `argv[0]` heads of configured bash-step `command`s).
- No `--version`-flag negotiation per agent (the contract is `<bin> --version`; non-zero/error ⇒ failure, as SPEC prescribes).
- No new structural invariant for the preflight binary table (documented manual-sync risk instead).
- No per-issue workflow enumeration: the gate checks `args.workflow` only (the active workflow at startup), not every configured workflow.

## Implementation Approach
The gate is a read-only startup probe. `runPreflight` is given the loaded `cfg`, the active `workflowName` (= `args.workflow`), an `env` seam (default `process.env`, source of `CYCLE_<AGENT>_BIN` overrides), and injectable seams for WSL (`procVersion`) and the shadow prefix (`shadowPrefix`, default `/mnt/c/`). It:
1. Computes the **distinct agent set** = (active workflow's non-`bash` step agents) ∪ ({`cfg.triage.agent`} if a known agent). If the workflow name doesn't resolve, degrade to triage-agent-only.
2. Computes the **tool set** = `{bash, git}` ∪ bare-name `argv[0]` heads of the active workflow's bash-step `command`s (tokens containing `/` are repo-relative script paths, skipped — so the shipped `scripts/*.sh` steps add nothing; a literal `diff …` step would add `diff`). If the workflow is unresolved, just `{bash, git}`.
3. Resolves each agent binary exactly as the lanes do (env override, else bare name resolved against `buildChildEnv({}).PATH`), `spawnSync(<resolved>, ["--version"], { env: buildChildEnv({}), shell:false })`; non-zero/error/unresolved ⇒ failed check with resolved path + fix.
4. Resolves each tool on the same curated PATH (presence check, no probe); missing ⇒ failed check.
5. For any resolved path under `shadowPrefix` when WSL, records a non-fatal `wsl_shadow` warning.
6. Wraps the whole body in `try/catch`; an unexpected internal error becomes a single synthetic failure (never a raw throw).

`cli.ts` owns event emission (keeps the module pure of the logger): emit one `engine.preflight.warning` per warning (not cardinality-pinned), then exactly one terminal `engine.preflight.ok` or `engine.preflight.failed`. Tests inject real fake binaries via `CYCLE_<AGENT>_BIN` (hermetic) and exercise missing-tool by narrowing `process.env.PATH` to an empty temp dir in `try/finally`.

## Failure & Resilience Decisions

**Task 1 (parse-args flag)** — N/A — pure (in-memory arg parsing, no I/O surface).

**Task 2 (preflight module — `spawnSync` probes, PATH resolution, `/proc/version` read)**
- **Failure modes**: (a) binary unresolved on PATH ⇒ recorded failed check (`resolvedPath:null`, "not found on PATH" fix), never throws. (b) probe `spawnSync` returns non-zero `status` or an `error` (ENOENT/EACCES/wrong-platform) ⇒ failed check with resolved path + install fix; `error` is inspected, not rethrown. (c) `/proc/version` missing/unreadable ⇒ `readProcVersion` returns `null` ⇒ `isWsl=false`, no warning, no crash. (d) unexpected internal error anywhere in the body ⇒ outer `try/catch` converts it to a single synthetic failure `{ kind:"internal", name:"preflight", fix: err.message }` so `ok=false` and the caller halts cleanly — no raw stack trace.
- **Idempotency**: fully idempotent — read-only (no file writes, no state mutation); spawns only `--version`/no-op probes with no side effects. The engine may re-run it (retry/restart) with identical results. Single-engine exclusion already held via the PID lockfile acquired before the gate.
- **Observability**: returns a structured `PreflightResult` (per-check `resolvedPath`/`ok`/`fix`, `failures[]`, `warnings[]`) that the caller renders into `engine.preflight.failed { failures }` / `engine.preflight.warning` JSONL events — the sole observability channel.
- **No silent failure**: every probe error path appends a failed check (never an empty `catch`); the outer catch surfaces internal errors as a failure. No error is swallowed — all reach the caller via `ok=false` + a failures payload.

**Task 3 (cli.ts wiring — event emission, exit)**
- **Failure modes**: `runPreflight` cannot reject (Task 2 guarantees a value). On `ok=false`, emit `engine.preflight.failed` + `engine.stop` then `process.exit(1)` before any `cycle.start`. A `log.emit` write error propagates as the engine's existing startup-failure behavior (consistent with the triage-failed branch, which does not guard `emit`).
- **Idempotency**: runs once per `cycle run` after the lock; the `process.on("exit")` lock release still fires on the early exit.
- **Observability**: `engine.preflight.ok` (pass) / `engine.preflight.failed { failures }` + `engine.stop { status:"halted", reason:"preflight_failed" }` in `.cycle/log.jsonl`; warnings as `engine.preflight.warning`.
- **No silent failure**: the failure path is an explicit non-zero exit with a logged reason; `--skip-preflight` is the only bypass and emits nothing (documented opt-out, not a swallow).

**Task 4 (coverage floor + docs)** — N/A — pure (config table + Markdown; enforced by existing gates).

---

## Task 1: Add `--skip-preflight` flag to `RunArgs` / `parseArgs`

### Overview
Surface the opt-out flag so `cli.ts` can read `args.skipPreflight`.

### Changes Required
**File**: `src/cli/parse-args.ts`
**Changes**:
- Add `skipPreflight: boolean;` to the `RunArgs` type (after `trunk`).
- Add to the `run` options map: `"skip-preflight": { type: "boolean", default: false },`.
- Add to the returned object: `skipPreflight: Boolean(values["skip-preflight"]),`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `parseArgs(["run", "--skip-preflight"]).skipPreflight === true`; default `false` when absent.
- [ ] Existing `parse-args` tests still pass.
- [ ] Failure paths behave as designed (N/A — pure).

---

## Task 2: Implement `src/engine/preflight.ts`

### Overview
The gate's core: distinct-agent + tool computation, binary resolution mirroring the exec lanes, `--version` probes, WSL shadow detection, fix strings, and a structured result — all under one defensive `try/catch`.

### Changes Required
**File**: `src/engine/preflight.ts` (new)
**Changes**:

Types:
```ts
export type PreflightCheck = {
  kind: "agent" | "tool";
  name: string;            // agent name (e.g. "claudecode") or tool name (e.g. "git")
  resolvedPath: string | null;
  ok: boolean;
};
export type PreflightFailure = {
  kind: "agent" | "tool" | "internal";
  name: string;
  resolvedPath: string | null;
  fix: string;
};
export type PreflightWarning = {
  kind: "wsl_shadow";
  target: string;          // agent/tool name
  resolvedPath: string;
  message: string;
};
export type PreflightResult = {
  ok: boolean;
  checks: PreflightCheck[];
  failures: PreflightFailure[];
  warnings: PreflightWarning[];
};

export type PreflightOpts = {
  cfg: CycleConfig;
  workflowName: string;
  env?: Record<string, string | undefined>;   // default process.env (CYCLE_*_BIN source)
  procVersion?: string | null;                 // injectable WSL probe; default reads /proc/version
  shadowPrefix?: string;                        // default "/mnt/c/"
};
```

Binary table (the manual mirror of the exec lanes — name ≠ binary ≠ env-stem for claudecode):
```ts
const AGENT_BINARY: Record<string, { env: string; bin: string; install: string }> = {
  claudecode: { env: "CYCLE_CLAUDE_BIN",   bin: "claude",   install: "reinstall the Claude Code CLI natively for your platform" },
  codex:      { env: "CYCLE_CODEX_BIN",    bin: "codex",    install: "npm i -g @openai/codex@latest" },
  gemini:     { env: "CYCLE_GEMINI_BIN",   bin: "gemini",   install: "reinstall the Gemini CLI natively for your platform" },
  auggie:     { env: "CYCLE_AUGGIE_BIN",   bin: "auggie",   install: "reinstall the Auggie CLI natively for your platform" },
  opencode:   { env: "CYCLE_OPENCODE_BIN", bin: "opencode", install: "reinstall the opencode CLI natively for your platform" },
  pi:         { env: "CYCLE_PI_BIN",       bin: "pi",       install: "reinstall the pi CLI natively for your platform" },
};
```
> Keep `AGENT_BINARY` keys in sync with `exec.ts` `REGISTRY` and each lane's `CYCLE_<AGENT>_BIN` resolution — manual, like the existing fleet-consistency note in CLAUDE.md (no structural invariant in scope here).

Helpers (pure where possible):
- `function readProcVersion(): string | null` — `try { return readFileSync("/proc/version","utf8") } catch { return null }`.
- `function isWsl(procVersion: string | null): boolean` — `!!procVersion && procVersion.toLowerCase().includes("microsoft")`.
- `function resolveOnPath(bin: string, pathEnv: string): string | null` — if `bin.includes("/")` return `bin` when it exists & is a regular file (via `statSync` in try/catch) else still return `bin` verbatim (absolute override is reported even if missing — probe will fail it); otherwise split `pathEnv` on `:`, return first `join(dir,bin)` that exists & is executable (`accessSync(..., X_OK)` in try/catch), else `null`.
- `function distinctAgents(cfg, workflowName): string[]` — find workflow; collect `steps.filter(s => s.agent !== "bash").map(s => s.agent)`; add `cfg.triage.agent` if `knownAgents().includes(it)`; dedupe via `Set`. Missing workflow ⇒ just the triage agent (if known).
- `function detectTools(cfg, workflowName): string[]` — start `["bash","git"]`; for the resolved workflow's bash steps with a `command`, take `command.trim().split(/\s+/)[0]`; if it is a bare name (no `/`) add it; dedupe. Missing workflow ⇒ `["bash","git"]`.

`runPreflight(opts): PreflightResult` body, all inside one `try/catch`:
```ts
const env = opts.env ?? process.env;
const childPath = buildChildEnv({}).PATH ?? "";
const wsl = isWsl(opts.procVersion === undefined ? readProcVersion() : opts.procVersion);
const shadowPrefix = opts.shadowPrefix ?? "/mnt/c/";
const checks: PreflightCheck[] = [];
const failures: PreflightFailure[] = [];
const warnings: PreflightWarning[] = [];

for (const agent of distinctAgents(opts.cfg, opts.workflowName)) {
  const spec = AGENT_BINARY[agent];                 // always present (known agent)
  const override = env[spec.env];
  const resolved = override ?? resolveOnPath(spec.bin, childPath);
  if (!resolved) {
    failures.push({ kind:"agent", name:agent, resolvedPath:null,
      fix:`${agent} binary "${spec.bin}" not found on PATH. Install it or set ${spec.env} to its path.` });
    checks.push({ kind:"agent", name:agent, resolvedPath:null, ok:false });
    continue;
  }
  const probe = spawnSync(resolved, ["--version"], { env: buildChildEnv({}), shell:false });
  const ok = !probe.error && probe.status === 0;
  checks.push({ kind:"agent", name:agent, resolvedPath:resolved, ok });
  if (!ok) failures.push({ kind:"agent", name:agent, resolvedPath:resolved,
    fix: agentFix(agent, resolved, spec, shadowPrefix, probe) });
  if (wsl && resolved.startsWith(shadowPrefix))
    warnings.push(shadowWarning(agent, resolved));
}

for (const tool of detectTools(opts.cfg, opts.workflowName)) {
  const resolved = resolveOnPath(tool, childPath);
  const ok = resolved !== null;
  checks.push({ kind:"tool", name:tool, resolvedPath:resolved, ok });
  if (!ok) failures.push({ kind:"tool", name:tool, resolvedPath:null,
    fix:`${tool} not found on PATH. Install ${tool} before running cycle (or use --skip-preflight).` });
  else if (wsl && resolved.startsWith(shadowPrefix))
    warnings.push(shadowWarning(tool, resolved));
}

return { ok: failures.length === 0, checks, failures, warnings };
// catch (err) => { ok:false, checks:[], warnings:[],
//   failures:[{ kind:"internal", name:"preflight", resolvedPath:null, fix:(err as Error).message }] }
```
`agentFix` produces the SPEC-mandated wording when the resolved path is under `shadowPrefix` (the Windows-build case): ``${agent} resolved to ${resolved} — a Windows build missing the linux-x64 binary. Install natively: ${spec.install}`` (for `codex` under `/mnt/c/.../npm/codex` this reads substantially like the SPEC example), and a generic ``${agent} resolved to ${resolved} — its `--version` probe failed (exit ${probe.status}). ${spec.install}`` otherwise. `shadowWarning(target, path)` ⇒ message ``${target} resolves under ${path} (WSL /mnt/c) — this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.``

Imports: `spawnSync` from `node:child_process`; `readFileSync`/`statSync`/`accessSync`/`constants` from `node:fs`; `join` from `node:path`; `buildChildEnv` from `./child-env.ts`; `knownAgents` from `./exec.ts`; `CycleConfig` type from `./workflow.ts`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `tests/engine/preflight.test.ts` passes all five scenarios (see Testing Strategy).
- [ ] Clean pass returns `ok:true`, empty `failures`; missing-agent/wrong-platform/missing-tool each return `ok:false` with the expected resolved path + fix.
- [ ] WSL + `/mnt/c`-prefixed resolved path yields a `wsl_shadow` warning while `ok` stays driven only by probe results.
- [ ] Failure paths behave as designed: no probe error escapes as a throw; an injected internal error returns a single `internal` failure with the message (no raw stack trace).

---

## Task 3: Wire the gate into `src/cli.ts` (events + halt + opt-out)

### Overview
Run the gate after `engine.start`, before triage; emit the events and halt cleanly on failure.

### Changes Required
**File**: `src/cli.ts`
**Changes**: Insert between line 217 (`engine.start` emit) and line 219 (`if (cfg)` triage block):
```ts
if (cfg && !args.skipPreflight) {
  const pf = runPreflight({ cfg, workflowName: args.workflow });
  for (const w of pf.warnings) {
    await log.emit("engine.preflight.warning", {
      kind: w.kind, target: w.target, resolved_path: w.resolvedPath, message: w.message,
    });
  }
  if (!pf.ok) {
    await log.emit("engine.preflight.failed", {
      failures: pf.failures.map(f => ({
        kind: f.kind, name: f.name, resolved_path: f.resolvedPath, fix: f.fix,
      })),
    });
    await log.emit("engine.stop", {
      status: "halted", dry_run: false, cycles_processed: 0, reason: "preflight_failed",
    });
    process.exit(1);
  }
  await log.emit("engine.preflight.ok", { checks: pf.checks.length });
}
```
Add `import { runPreflight } from "./engine/preflight.ts";` with the other engine imports. `args.skipPreflight` exists from Task 1.

### Success Criteria
- [ ] Builds cleanly; `npm run typecheck` clean.
- [ ] CLI-level test: preflight failure ⇒ non-zero exit, `engine.preflight.failed` and `engine.stop {reason:"preflight_failed"}` in the log, **no `cycle.start`**.
- [ ] Healthy run ⇒ exactly one `engine.preflight.ok` (`filter(e => e.event === "engine.preflight.ok").length === 1`), cycles proceed.
- [ ] `cycle run --skip-preflight` ⇒ neither preflight event present.
- [ ] Failure paths behave as designed: the halt is an explicit logged non-zero exit; no error swallowed.

---

## Task 4: Coverage floor + documentation

### Overview
Register the per-file coverage floor and complete the required doc updates.

### Changes Required
**File**: `scripts/coverage-gate.mjs` — add to the `FLOORS` table: `"src/engine/preflight.ts": { line: 95, branch: 75, function: 90 }` (line floor consistent with engine modules; aggregate must not regress).
**File**: `CLAUDE.md` — under Commands/Workflow-defaults: document the preflight gate, `--skip-preflight`, the `engine.preflight.ok` / `engine.preflight.failed` / `engine.preflight.warning` events, the agent+tool probe contract (`CYCLE_<AGENT>_BIN`-aware resolution + `--version`; tools `bash`/`git` + detected step tools), and the WSL `/mnt/c` shadow warning; add `src/engine/preflight.ts` to the Architecture module list and note the `AGENT_BINARY` manual-sync requirement.
**File**: `docs/ENGINE.md` — new *Preflight gate* section: when it runs (after lock/config load, before triage + cycle 1), what it checks, the WSL PATH-hygiene warning, the event contract, the clean-halt-vs-crash guarantee, and the opt-out.
**File**: `README.md` — surface the gate and `--skip-preflight` in the user-facing run description.

> `src/defaults/` is not touched by this cycle, so `npm run sync-defaults` is not required. Confirm with a search that no defaults file references preflight before skipping it.

### Success Criteria
- [ ] `npm run test:coverage` passes `check:coverage` (new floor met, aggregate not regressed) and `check:invariants`.
- [ ] All three docs updated; CLAUDE.md Architecture list includes `src/engine/preflight.ts`.
- [ ] Failure paths behave as designed (N/A — pure).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A missing agent binary (agent's `CYCLE_<AGENT>_BIN` points at a nonexistent path) causes the engine to emit `engine.preflight.failed` with that agent's resolved path and fix, emit `engine.stop`, and exit non-zero **before** any `cycle.start` event is logged. | Task 2 + Task 3 | Module records the failed check (resolved path = override value, probe errors); cli.ts emits events + exits. |
| [ ] A wrong-platform agent binary (probe exits non-zero) causes a clean halt whose diagnostic includes the resolved path and an install fix — no raw stack trace reaches stdout/stderr. | Task 2 + Task 3 | `agentFix` Windows-build wording when under `/mnt/c`, generic-with-`spec.install` otherwise; outer `try/catch` guarantees no raw throw. |
| [ ] A missing required tool (`bash`, `git`, or a detected step tool such as `diff` absent from PATH) causes the same clean, actionable `engine.preflight.failed` halt. | Task 2 + Task 3 | `detectTools` + `resolveOnPath` presence check; failed check ⇒ same halt path. |
| [ ] In a simulated WSL environment with an agent or tool resolving under `/mnt/c/...`, a shadow warning is emitted and (if all probes otherwise pass) the gate still passes. | Task 2 + Task 3 | Injected `procVersion`/`shadowPrefix` seams; warning is non-fatal, `ok` driven only by failures. |
| [ ] A healthy environment emits `engine.preflight.ok` exactly once (`filter(e => e.event === "engine.preflight.ok").length === 1`) and cycles proceed unchanged. | Task 3 | Single `engine.preflight.ok` emit on `pf.ok`. |
| [ ] `cycle run --skip-preflight` runs no probes and emits neither `engine.preflight.ok` nor `engine.preflight.failed`. | Task 1 + Task 3 | `if (cfg && !args.skipPreflight)` guard skips the entire block. |
| [ ] All existing tests still pass. | Task 1–4 | `npm run test:coverage` in the build/fix steps. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1–4 | `npm run typecheck` verified each task. |

---

## Testing Strategy

### Unit Tests
`tests/engine/preflight.test.ts` (Node `node:test` + `assert/strict`, temp-dir fake-binary + `CYCLE_<AGENT>_BIN` injection per `exec-codex.test.ts:16-43`, all in `try/finally`):
- **Clean pass**: a minimal `cfg` whose active workflow uses one agent injected via `CYCLE_<AGENT>_BIN` ⇒ a temp `#!/bin/bash` script exiting 0 on `--version`; `bash`/`git` real on PATH ⇒ `ok:true`, empty `failures`, no warnings.
- **Missing agent binary** (failure-path): `CYCLE_<AGENT>_BIN` = a nonexistent temp path ⇒ one `agent` failure, `resolvedPath` = that path (or `null` for the unresolved-bare-name variant), fix mentions the env var.
- **Wrong-platform agent** (failure-path): fake binary that `exit 1`s on `--version` ⇒ `agent` failure with resolved path + `spec.install` fix; with the path placed under an injected `shadowPrefix`, assert the Windows-build wording substring (`a Windows build missing the linux-x64 binary`).
- **Missing required tool** (failure-path): narrow `process.env.PATH` to an empty temp dir in `try/finally` (so `git` doesn't resolve; agents still resolve via absolute `CYCLE_<AGENT>_BIN`) ⇒ `tool` failure for `git`; assert no agent-name PATH-stub is used (hermeticity).
- **WSL shadow**: inject `procVersion:"... microsoft ..."` and `shadowPrefix` = the temp dir holding a passing fake agent binary (`CYCLE_<AGENT>_BIN` under it) ⇒ exactly one `wsl_shadow` warning, `ok:true`.
- **Internal-error guard** (failure-path): pass a `cfg` that makes a helper throw (e.g. a malformed `triage`/`workflows` shape reaching a seam) and assert a single `internal` failure carrying the message — no throw escapes.
- **Static tool detection**: a `cfg` workflow with a bash step `command:"diff a b"` ⇒ `diff` appears in the tool set; a step `command:"scripts/verify.sh"` ⇒ no extra tool (path skipped).
- **Mocking strategy**: anti-mock — real `spawnSync` against real temp fake binaries; only the WSL probe (`procVersion`) and `shadowPrefix` are injected seams. No agent-name PATH stubbing.

### Integration / E2E Tests
CLI-level test (new `tests/cli/preflight.test.ts`, pattern from `tests/cli/halt.test.ts:10-42`, spawning built `dist/cycle.js` against a bootstrapped temp repo):
- **Failure halts before cycle 1**: bootstrap a repo whose active workflow references an agent injected via `CYCLE_<AGENT>_BIN` = nonexistent path; run `cycle run`; assert non-zero exit, `engine.preflight.failed` + `engine.stop {reason:"preflight_failed"}` in `.cycle/log.jsonl`, and **no `cycle.start`** line.
- **Opt-out**: same repo with `--skip-preflight` ⇒ no `engine.preflight.*` events (it then proceeds to the normal triage/drain path).
- **Healthy pass** (if the harness can provide passing fake agent binaries via env): assert exactly one `engine.preflight.ok` and that cycles proceed (`filter(...).length === 1`).

## Risk Assessment
- **`AGENT_BINARY` table drift vs. exec lanes**: a future agent added to `REGISTRY` without a matching `AGENT_BINARY` entry would be probed as `undefined`. Mitigation: derive the agent set from `knownAgents()` and look up `AGENT_BINARY[agent]`; document the manual-sync requirement in CLAUDE.md alongside the existing fleet-consistency note; a missing entry surfaces immediately as an `internal` failure (loud), not a silent skip.
- **`--version` not universally supported** (gemini/auggie/pi CLIs unverified in-repo): a CLI that doesn't accept `--version` would fail preflight on a healthy machine. Mitigation: this matches the SPEC-prescribed contract; `--skip-preflight` is the documented escape hatch, and the fix string names the resolved path so the user can verify manually.
- **`buildChildEnv({}).PATH` vs. the real probe PATH divergence**: resolution and probe must use the *same* PATH or a "resolved but unprobeable" mismatch appears. Mitigation: both use `buildChildEnv({})`; resolution reads `childPath` computed from it once.
- **Missing-tool test fragility** (narrowing `process.env.PATH` globally): could leak across tests. Mitigation: restore in `try/finally`; agents resolve via absolute `CYCLE_<AGENT>_BIN` so they're unaffected by the narrowed PATH.
