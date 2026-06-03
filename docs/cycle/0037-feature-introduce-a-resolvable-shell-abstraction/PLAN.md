# Implementation Plan: Cycle 0037

## Overview
Replace the two hard-coded `/bin/bash` spawn sites (`execBashStep`, `execWalkthroughHook`) with a single pure, injectable `resolveShell` helper in a new `src/engine/shell.ts`, wired through `run-cycle.ts`, so bash/script steps run on native-Windows PowerShell hosts (via discovered git-bash / WSL bash) while Linux/macOS behavior stays byte-for-byte identical.

## Current State (from Research)
- `execBashStep` (`src/engine/exec-bash.ts:8-29`) hard-spawns `"/bin/bash"` (`:11`) with array args, `shell:false`, `buildChildEnv(env)`, and has a **close-only** result handler — **no `error` handler**, so a `spawn` `ENOENT` rejects/emits unhandled rather than resolving a failed `StepResult`.
- `execWalkthroughHook` (`src/engine/walkthrough.ts:73-122`) hard-spawns `"/bin/bash"` (`:82`) with `detached:true` and **already** has a `child.on("error", …)` handler resolving `{ status:"failed", exitCode:-1, … }` (`:110`).
- `StepResult` shape: `{ status, exitCode, stdout, stderr, rateLimited?, timedOut? }` (`src/engine/exec-types.ts:1-9`).
- `EngineConfig` (`src/engine/workflow.ts:28-60`) carries optional-string `walkthrough_hook?: string` (`:53`) as the closest precedent for a new optional engine path string; `loadConfig` (`:81-156`) validates `engine`/`triage`/`workflows` and resolves `commit`/`defaults`.
- Call sites: `execBashStep(repoRoot, step.command!, cycleEnv)` (`run-cycle.ts:531`); `execWalkthroughHook(repoRoot, hook, env, { timeoutMs })` (`run-cycle.ts:401-406`). `cfg` is in scope at both (loaded `run-cycle.ts:276`).
- Patterns to follow: subprocess discipline (`buildChildEnv`, array args, `shell:false` — `child-env.ts:16-33`); injectable platform/probe seams (`preflight.ts:84-95`, `:190`, `:214`); env-override idiom `CYCLE_<X>_BIN ?? "<bin>"` (`preflight.ts:76-81`); defensive optional-config handling.
- Tests: `node:test` + `node:assert/strict`, `.ts` direct; real-FS temp dirs for spawn lanes, injected seams for pure logic. `exec-bash.test.ts` (2 cases, no binary assertion, no failure path). Coverage floors in `scripts/coverage-gate.mjs:12-41`; `exec-bash.ts` has **no** floor today.

### Open Questions — Resolved
1. **Threading the shell into the lanes** → run-cycle resolves the shell once and passes a `ShellResolution` value into each lane as a new optional parameter. The lanes stay spawn-only; resolution stays pure and centralized. The new lane parameter defaults to resolving from the real `process.platform`/`process.env`/`existsSync`, so existing 3-arg `execBashStep` / 4-arg `execWalkthroughHook` calls (and their tests) are unchanged on Linux.
2. **Where the failure message lives** → `resolveShell` returns a structured unresolved result `{ ok: false, searched: string[], message: string }` and **owns the message text** (searched locations + remediation). The lane uses `resolution.message` verbatim as `stderr`. Centralizes the text in `shell.ts` for direct unit testing.
3. **`execBashStep` spawn-error handler** → **add one**. It covers the distinct failure mode of a *configured* shell path that does not exist (`ENOENT`), converting it to a failed `StepResult` per SPEC Requirements. The unresolved-resolution branch covers the *nothing-discovered* mode; both are required.
4. **Windows candidate list** (ordered, git-bash preferred for POSIX fidelity, WSL launcher last):
   1. `C:\Program Files\Git\bin\bash.exe`
   2. `C:\Program Files (x86)\Git\bin\bash.exe`
   3. `C:\Program Files\Git\usr\bin\bash.exe`
   4. `C:\Windows\System32\bash.exe`
5. **`exec-bash.ts` coverage floor** → **add** a floor of `90` (matches `exec-spawn.ts`) now that the lane gains an error branch and an unresolved branch.

## Desired End State
- `src/engine/shell.ts` exports `resolveShell` (pure, injectable) and a `ShellResolution` discriminated union.
- Both spawn sites use the resolved shell; on Linux/macOS with no config/env the spawned binary is still exactly `/bin/bash`.
- On simulated Windows with a discoverable `bash.exe`, the lane spawns that path; with nothing discoverable, `execBashStep` resolves `status:"failed"` with an actionable `stderr` and never throws `ENOENT`.
- `engine.shell` config and `CYCLE_SHELL` env override discovery (config wins).
- `npm run typecheck`, `npm test`, `npm run test:coverage` (incl. `check:coverage` + `check:invariants`) all pass; a coverage floor exists for `shell.ts` and `exec-bash.ts`.
- CLAUDE.md, `docs/ENGINE.md`, and README.md document the module, precedence, candidate list, and the Windows-unresolved contract.

Verify: `npm run typecheck && npm run test:coverage`; inspect new `tests/engine/shell.test.ts` cases; confirm `exec-bash.test.ts` asserts the resolved binary and the Windows-unresolved failure.

## What We're NOT Doing
- No `pwsh`/PowerShell step type and no running step scripts as native PowerShell — scripts remain POSIX-shell scripts.
- No preflight shell probing or new preflight checks (Phase 1 already landed).
- No cross-platform setup guide, no path-separator / line-ending audit (Phase 3).
- No per-step `shell:` override — engine-level config + `CYCLE_SHELL` env only.
- No new structural invariant pinning the `/bin/bash` literal (optional, not SPEC-required).
- No new external services or runtime dependencies.

## Implementation Approach
A single pure resolver (`resolveShell`) is the keystone: it takes injected `{ platform, env, config, existsSync }` and returns a `ShellResolution`, performing **no spawning**. Run-cycle calls it once per spawn site (passing the real `process.platform`/`process.env`/`existsSync`) and threads the result into the lane via a new optional parameter that defaults to the same real-environment resolution — preserving every existing call signature on Linux. The lanes format failures from the resolution's own message (unresolved) and add an `error` handler (configured-but-missing). Config plumbing is minimal: a new optional `EngineConfig.shell` field, normalized to unset when non-string at load. Tests use real temp-dir scripts (anti-mock) for the lanes and pure injection for the resolver.

## Failure & Resilience Decisions

**Task 1 — `resolveShell` (`src/engine/shell.ts`)**
- **Failure modes**: none that throw. The only "failure" is the structured `{ ok:false, searched, message }` return on Windows when no candidate exists and no override is set. `existsSync` is injected; if a caller's real `existsSync` throws, that surfaces to the lane caller (run-cycle), not swallowed here — but the resolver itself does no I/O beyond the injected probe.
- **Idempotency**: N/A — pure. No state, no spawn, no filesystem write. Safe to call any number of times.
- **Observability**: the unresolved result carries `searched` (the exact paths probed) and a human-readable `message` (paths + remediation), which the lane emits as `step.end.stderr`.
- **No silent failure**: the unresolved branch is an explicit typed result the lane must handle (TypeScript discriminated union forces handling); nothing is swallowed.

**Task 3 — `execBashStep` rewire (`src/engine/exec-bash.ts`)**
- **Failure modes**: (a) unresolved shell ⇒ resolve `{ status:"failed", exitCode:1, stdout:"", stderr: resolution.message }` **without spawning**; (b) configured/resolved shell path missing ⇒ new `child.on("error", …)` resolves `{ status:"failed", exitCode:-1, stdout, stderr: stderr + String(err) }`; (c) script non-zero exit ⇒ existing close-handler `status:"failed"`.
- **Idempotency**: spawns a child process; the script is the user's `.cycle/<command>` and re-run safety is the script's own concern (unchanged from today). The unresolved branch performs no spawn at all, so it is trivially re-run-safe. Failed steps route through the existing `max_cycle_attempts` retry / `max_consecutive_failures` halt accounting — unchanged.
- **Observability**: failures surface via the resolved `StepResult.stderr`, which run-cycle emits in `step.end { status:"failed", stderr }`. No raw `ENOENT` stack escapes.
- **No silent failure**: every branch resolves an explicit `StepResult`; the new `error` handler guarantees a spawn error becomes a failed result instead of an unhandled rejection.

**Task 4 — `execWalkthroughHook` rewire (`src/engine/walkthrough.ts`) + run-cycle wiring**
- **Failure modes**: unresolved shell ⇒ resolve a failed `StepResult` with `resolution.message` (mirrors Task 3) before arming any timer; the existing `error`/`close`/timeout handlers are otherwise untouched. A non-zero/failed/timed-out result routes through the existing fatal step-failure path (`run-cycle.ts:407-419`).
- **Idempotency**: walkthrough hook spawn semantics unchanged (still `detached:true`, bounded-kill on timeout); the unresolved branch spawns nothing. Re-run safety is unchanged from current behavior.
- **Observability**: failures via `step.end { status:"failed", stderr }`; existing `step.walkthrough_capture_failed` degrade path is unchanged.
- **No silent failure**: unresolved and error paths both resolve explicit failed `StepResult`s through the single-resolve `done(...)` guard.

**Task 2 — config plumbing (`src/engine/workflow.ts`)**
- **Failure modes**: a non-string `engine.shell` is normalized to unset (dropped) at load — never throws (SPEC: "absent/non-string ⇒ unset"). A malformed top-level config still throws via the existing `loadConfig` guards.
- **Idempotency**: N/A — config parse is read-only/in-memory.
- **Observability**: N/A — silent normalization is the specified contract; the *effect* (which shell is used) is observable via the spawn and any failure message.
- **No silent failure**: the only swallowed case is the explicitly-specified non-string-⇒-unset normalization; downstream resolution then falls through to env/auto-discovery, which fails loudly on Windows if nothing resolves.

**Task 5 — documentation**: N/A — pure docs.

---

## Task 1: Create `src/engine/shell.ts` with `resolveShell`

### Overview
The pure, injectable shell resolver and its result type — the single source of resolution precedence and the Windows-unresolved message.

### Changes Required
**File**: `src/engine/shell.ts` (new)
**Changes**:
```ts
export type ShellResolution =
  | { ok: true; path: string }
  | { ok: false; searched: string[]; message: string };

/** Ordered Windows bash.exe probe locations (git-bash preferred, WSL last). */
export const WINDOWS_SHELL_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Windows\\System32\\bash.exe",
] as const;

export const POSIX_DEFAULT_SHELL = "/bin/bash";

export type ResolveShellInput = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  config?: string;              // cfg.engine.shell
  existsSync: (p: string) => boolean;
};

export function resolveShell(input: ResolveShellInput): ShellResolution {
  // 1. explicit config — used verbatim, NO existsSync check (user owns the choice)
  const cfg = input.config;
  if (typeof cfg === "string" && cfg.trim() !== "") return { ok: true, path: cfg };
  // 2. CYCLE_SHELL env — used verbatim
  const envShell = input.env.CYCLE_SHELL;
  if (typeof envShell === "string" && envShell.trim() !== "") return { ok: true, path: envShell };
  // 3. platform auto-discovery
  if (input.platform !== "win32") return { ok: true, path: POSIX_DEFAULT_SHELL };
  for (const cand of WINDOWS_SHELL_CANDIDATES) {
    if (input.existsSync(cand)) return { ok: true, path: cand };
  }
  // 4. Windows unresolved — structured failure with searched list + remediation
  return {
    ok: false,
    searched: [...WINDOWS_SHELL_CANDIDATES],
    message:
      "cycle: no POSIX shell found for bash steps on Windows. Searched:\n" +
      WINDOWS_SHELL_CANDIDATES.map(p => `  - ${p}`).join("\n") +
      "\nFix: install Git for Windows (git-bash) or WSL, or set engine.shell in " +
      ".cycle/workflows.yml or the CYCLE_SHELL environment variable to a bash path.",
  };
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run typecheck`)
- [ ] `tests/engine/shell.test.ts` passes (Task added in Testing Strategy)
- [ ] POSIX default, Windows discovery (each candidate), config override, env override, config-over-env, and Windows-unresolved all return the documented shape
- [ ] Failure paths behave as designed (unresolved returns typed `{ ok:false }`; never throws, never spawns)

---

## Task 2: Plumb `engine.shell` through config

### Overview
Add the optional `shell?: string` field to `EngineConfig` and normalize a non-string value to unset at load.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**:
- Add to `EngineConfig` (after `walkthrough_hook_timeout_ms`, mirroring the `walkthrough_hook` doc-comment style):
```ts
  /** Optional shell binary used to run bash/script steps and the walkthrough
   * hook. Absent/empty/non-string ⇒ unset (auto-discovery applies). Used
   * verbatim when set (existence is the user's responsibility). See
   * src/engine/shell.ts resolveShell precedence. */
  shell?: string;
```
- In `loadConfig`, after the commit block, normalize:
```ts
  if (typeof parsed.engine.shell !== "string" || parsed.engine.shell.trim() === "") {
    delete parsed.engine.shell;
  }
```

### Success Criteria
- [ ] Compiles cleanly; `CycleConfig` consumers unaffected
- [ ] A config with non-string `engine.shell` loads with `shell` unset (test)
- [ ] A config with a string `engine.shell` retains it (test)
- [ ] Configs with no `engine.shell` load unchanged
- [ ] Failure paths behave as designed (non-string ⇒ unset, never throws)

---

## Task 3: Wire `resolveShell` into `execBashStep`

### Overview
Add an optional `ShellResolution` parameter, short-circuit a failed `StepResult` when unresolved, spawn the resolved path otherwise, and add a spawn-`error` handler.

### Changes Required
**File**: `src/engine/exec-bash.ts`
**Changes**:
```ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import { resolveShell, type ShellResolution } from "./shell.ts";

export type { StepResult } from "./exec-types.ts";
import type { StepResult } from "./exec-types.ts";

export function execBashStep(
  repoRoot: string,
  command: string,
  env: Record<string, string>,
  shell: ShellResolution = resolveShell({
    platform: process.platform, env: process.env, existsSync,
  }),
): Promise<StepResult> {
  return new Promise(resolve => {
    if (!shell.ok) {
      resolve({ status: "failed", exitCode: 1, stdout: "", stderr: shell.message });
      return;
    }
    const abs = join(repoRoot, ".cycle", command);
    const child = spawn(shell.path, [abs], {
      cwd: repoRoot, env: buildChildEnv(env), shell: false,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => resolve({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", code => resolve({
      status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr,
    }));
  });
}
```
Note: a single-resolve guard is unnecessary — `error` and `close` are mutually exclusive for a never-spawned-vs-spawned child, and Promise `resolve` is idempotent regardless.

### Success Criteria
- [ ] Compiles cleanly
- [ ] Existing two `exec-bash.test.ts` cases pass unchanged (default resolution → `/bin/bash` on Linux)
- [ ] New test: explicit resolved-shell path is the spawned entrypoint (sentinel-marker wrapper)
- [ ] New test: unresolved resolution ⇒ `status:"failed"`, `stderr` contains searched paths + remediation, no throw
- [ ] New test: `{ ok:true, path:"/nonexistent/bash" }` ⇒ `error` handler resolves `status:"failed"` (no unhandled rejection)
- [ ] Failure paths behave as designed (errors surfaced, no silent catch)

---

## Task 4: Wire `resolveShell` into `execWalkthroughHook` and run-cycle call sites

### Overview
Thread a `ShellResolution` into the walkthrough lane and have run-cycle resolve once per spawn site, passing the resolved value into both lanes.

### Changes Required
**File**: `src/engine/walkthrough.ts`
- Import `resolveShell` / `ShellResolution` (+ `existsSync` from `node:fs`).
- Add `shell?: ShellResolution` to the `opts` parameter; default-resolve when absent (same default expression as Task 3).
- At the top of the Promise body, before spawning: if `!shell.ok`, `done({ status:"failed", exitCode:1, stdout:"", stderr: shell.message })` and `return`.
- Replace `spawn("/bin/bash", [hookAbsPath], …)` with `spawn(shell.path, [hookAbsPath], …)`; keep `detached:true`, `shell:false`, `buildChildEnv(env)`, and the existing `error`/`close`/timeout handlers verbatim.

**File**: `src/engine/run-cycle.ts`
- Import `resolveShell` and `existsSync` (`node:fs`).
- At the bash dispatch (`:531`), resolve and pass:
```ts
const shell = resolveShell({ platform: process.platform, env: process.env, config: cfg.engine.shell, existsSync });
r = await execBashStep(repoRoot, step.command!, cycleEnv, shell);
```
- At the walkthrough call (`:401-406`), pass `shell` in opts:
```ts
const shell = resolveShell({ platform: process.platform, env: process.env, config: cfg.engine.shell, existsSync });
const wr = await execWalkthroughHook(repoRoot, hook,
  { ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir, ...(phase ? { CYCLE_WALKTHROUGH_PHASE: phase } : {}) },
  { timeoutMs: walkthroughTimeoutMs, shell });
```

### Success Criteria
- [ ] Compiles cleanly
- [ ] Existing `walkthrough.test.ts` / `run-cycle.walkthrough.test.ts` pass unchanged (Linux → `/bin/bash`)
- [ ] New test: unresolved resolution ⇒ walkthrough lane resolves `status:"failed"` with the message, routed through the fatal step-failure path; no timer armed
- [ ] run-cycle threads `cfg.engine.shell` into resolution at both sites
- [ ] Failure paths behave as designed (errors surfaced, no silent catch)

---

## Task 5: Documentation + coverage floors

### Overview
Document the module and contract; register coverage floors for the new and changed lanes.

### Changes Required
**File**: `scripts/coverage-gate.mjs` — add to `FLOORS`:
```js
  "src/engine/shell.ts": 100,
  "src/engine/exec-bash.ts": 90,
```
**File**: `CLAUDE.md` — under *Subprocess discipline* / *Architecture*: document `src/engine/shell.ts` (`resolveShell` precedence: `engine.shell` config → `CYCLE_SHELL` env → platform auto-discovery → Windows-unresolved), note bash/script steps + walkthrough hook now spawn a resolved shell (still array-args / `shell:false` / `buildChildEnv`) instead of a literal `/bin/bash`, and document the `engine.shell` config key + `CYCLE_SHELL` env override.
**File**: `docs/ENGINE.md` — add a *Shell resolution* subsection: precedence, the ordered Windows candidate list (Task 1 Open Q4), the Linux/macOS no-change guarantee, and the Windows-unresolved failed-`StepResult` contract.
**File**: `README.md` — one-line note that bash steps run on a resolvable shell and native-Windows users can install git-bash or set `engine.shell` (full per-platform setup deferred to Phase 3).

### Success Criteria
- [ ] `npm run check:coverage` enforces both new floors and passes
- [ ] CLAUDE.md, `docs/ENGINE.md`, README.md updated as specified
- [ ] No compiler/linter warnings introduced

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] On a simulated Windows platform with a discoverable git-bash `bash.exe`, `resolveShell` returns that absolute path, and a unit test asserts `execBashStep` spawns the resolved shell (not `/bin/bash`). | Task 1, Task 3 | shell.test.ts asserts the path; exec-bash.test.ts sentinel-wrapper test asserts the spawned entrypoint |
| [ ] On a simulated `linux` platform with empty config/env, `resolveShell` returns `/bin/bash`, demonstrating the user-observable benefit that existing POSIX runs are unchanged. | Task 1 | POSIX-default case in shell.test.ts; existing exec-bash.test.ts confirms behavior preserved |
| [ ] `engine.shell` config and `CYCLE_SHELL` env each override auto-discovery, with config taking precedence over env (asserted by unit tests with both set). | Task 1, Task 2 | config-override, env-override, and config-over-env cases in shell.test.ts |
| [ ] **Failure-path:** on a simulated Windows platform with no config, no `CYCLE_SHELL`, and `existsSync` returning false for every candidate, `execBashStep` resolves `status: "failed"` with a `stderr` that names the searched locations and the fix — asserted by a test that inspects the message, with no thrown exception. | Task 3 | Windows-unresolved test in exec-bash.test.ts; message originates in resolveShell (Task 1) |
| [ ] All existing bash-step and walkthrough tests pass unchanged (Linux behavior preserved byte-for-byte). | Task 3, Task 4 | Optional defaulting param keeps existing call signatures and Linux spawn identical |
| [ ] All existing tests still pass. | Task 1–5 | `npm test` gate |
| [ ] No compiler/linter warnings introduced. | Task 1–5 | `npm run typecheck` gate |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/shell.test.ts`** (new, pure — no FS, no spawn): POSIX default (`platform:"linux"`, empty config/env, `existsSync:()=>false` ⇒ `/bin/bash`); macOS (`"darwin"`) ⇒ `/bin/bash`; Windows git-bash discovery (each candidate, asserting first-hit ordering via an `existsSync` that returns true only for one path); Windows WSL discovery (only `System32\bash.exe` exists); `engine.shell` config override (verbatim, `existsSync:()=>false`, proving no existence check); `CYCLE_SHELL` env override; config-over-env (both set ⇒ config wins); empty-string config/env falls through to discovery; Windows-unresolved ⇒ `{ ok:false }` with `searched` = full candidate list and `message` containing every path + "git-bash"/"WSL"/"engine.shell"/"CYCLE_SHELL".
- **`tests/engine/exec-bash.test.ts`** (extend): existing two cases unchanged. Add: (a) explicit `{ ok:true, path:<temp wrapper> }` where the wrapper script echoes a unique sentinel then `exec /bin/bash "$@"` — assert the sentinel appears in stdout, proving the *resolved* shell was the spawn entrypoint, not the literal `/bin/bash`; (b) unresolved resolution ⇒ `status:"failed"`, `exitCode:1`, `stderr` matches `/Program Files\\Git/` and `/CYCLE_SHELL/`, with no thrown exception; (c) `{ ok:true, path:"/nonexistent/bash" }` ⇒ `error`-handler path resolves `status:"failed"`, `exitCode:-1` (no unhandled rejection).
- **`tests/engine/workflow.*` config test** (extend/add): non-string `engine.shell` ⇒ unset after load; string `engine.shell` retained; absent ⇒ unchanged.
- **Mocking strategy**: none — `resolveShell` uses injected `platform`/`env`/`existsSync`; the lanes use real temp-dir scripts (anti-mock, per RESEARCH conventions). No `node:fs/promises` stubbing.

### Integration / E2E Tests
- **`tests/engine/walkthrough.test.ts`** (extend): unresolved `ShellResolution` passed via opts ⇒ failed `StepResult` with the message and no timer armed; existing timeout/collect/manifest/phase cases pass unchanged with the default Linux resolution.
- No new run-cycle E2E required beyond confirming the existing bash-step and walkthrough run-cycle tests pass with the threaded resolution (SPEC: "No UI changes; no E2E tests required").

## Risk Assessment
- **Existing lane tests break on the new parameter**: mitigated by making the parameter optional with a default that resolves from the real environment — Linux callers and tests are unchanged.
- **`exec-bash.ts` 100% floor unreachable due to `code ?? -1` / error branch**: mitigated by setting the floor to `90` and covering the error branch with the `/nonexistent/bash` test; bump to 100 only if coverage confirms full branch hit.
- **Windows candidate list incomplete for some installs**: acceptable — `engine.shell` / `CYCLE_SHELL` overrides cover non-standard locations, and the unresolved message names both escape hatches; broader probing is Phase 3.
- **`CYCLE_SHELL` stripped by `buildChildEnv`**: not a risk — `resolveShell` reads it from the parent `process.env` before spawning; the child does not need it.
