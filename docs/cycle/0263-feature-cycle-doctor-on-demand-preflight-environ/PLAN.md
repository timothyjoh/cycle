# Implementation Plan: Cycle 0263

## Overview
Add a read-only, user-invokable `cycle doctor` subcommand (alias `cycle preflight`) that loads the repo config, runs the existing `runPreflight` against a selected workflow, renders the `PreflightResult` as a human-readable report on stdout, and exits 0 on a clean pass / non-zero on any failure — without acquiring the engine lock or mutating any state.

## Current State (from Research)
- `runPreflight(opts: PreflightOpts): PreflightResult` (`src/engine/preflight.ts:186`) is total (never throws): every probe error becomes a recorded failed check, and an internal throw is caught into a single `{ kind: "internal", … }` failure. `result.ok === (failures.length === 0)`; warnings never affect `ok`.
- Result types consumed by the renderer: `PreflightCheck { kind: "agent"|"tool"; name; resolvedPath: string|null; ok }`, `PreflightFailure { kind: "agent"|"tool"|"internal"; name; resolvedPath; fix }`, `PreflightWarning { kind: "wsl_shadow"; target; resolvedPath; message }`, `PreflightResult { ok; checks; failures; warnings }` (`src/engine/preflight.ts:21-47`).
- The minimal engine-start call is `runPreflight({ cfg, workflowName })` (`src/cli.ts:279`). `CYCLE_<AGENT>_BIN` overrides are honored transitively via `opts.env` (defaults to `process.env`).
- `loadConfig(repoRoot, env?): Promise<CycleConfig>` (`src/engine/workflow.ts:110`) **throws** on a missing (`workflows.yml missing: <path>`) or malformed file — it never returns nullish. `runDoctor` must wrap it in `try/catch`.
- CLI-module convention: `runCliCleanup(...) → { exitCode, stdout, stderr }` (`src/cli/cleanup.ts:27-31`). `runStatus({ cwd }) → string` is the simpler read-only variant.
- `src/cli.ts` subcommand dispatch is a series of `if (argv[0] === "<name>")` early-return blocks (`src/cli.ts:82-131`) that dynamically `import()` the module, write `result.stdout`/`result.stderr`, and `process.exit(result.exitCode)`. They all sit **before** `parseArgs` (`src/cli.ts:160`) and lock acquisition, so a new block there is read-only by construction. Each block does its own `argv.slice(1)` flag parsing — `parseArgs` rejects unknown first tokens (`src/cli/parse-args.ts:41`).
- `cycle help` usage text is a single `console.log` template (`src/cli.ts:133-158`).
- Hermetic test convention: inject forced-missing/present agents via an absolute `CYCLE_<AGENT>_BIN` path to a temp-dir fake — never PATH-stub a real agent name (`tests/engine/preflight.test.ts:9-57`). Temp-dir + `rm(..., { recursive: true, force: true })` in `finally`.

## Desired End State
- `src/cli/doctor.ts` exports `runDoctor({ cwd, workflow, env? }) → Promise<{ stdout, stderr, exitCode }>`.
- `src/cli.ts` has a `doctor`/`preflight` early-return dispatch block before `parseArgs`, extracting `--workflow <name>` (default `feature`) from `argv.slice(1)`.
- `cycle doctor` in a healthy repo prints one line per agent/tool check + any warnings, exits 0; with a forced-missing agent it exits non-zero and prints the binary name + remediation; on an unloadable config it prints a stderr diagnostic and exits non-zero with no stack trace.
- `cycle preflight` is byte-identical to `cycle doctor`.
- `npm test` and `npm run typecheck` pass; `src/cli/doctor.ts` registered at the 70% floor tier in `scripts/coverage-gate.mjs`.
- Verify: `node dist/cycle.js doctor` in this repo prints a report and exits 0; `CYCLE_CODEX_BIN=/nonexistent node dist/cycle.js doctor` exits non-zero and names `codex`.

## What We're NOT Doing
- No change to `runPreflight`, `AGENT_BINARY`, the `PreflightResult` types, or the engine-start preflight path in `src/cli.ts:278-306` (those `engine.preflight.*` events stay byte-for-byte).
- No JSON / machine-readable output mode — human-readable report only.
- No interactive `init` agent selection, no `--agent` flags, no writing `workflows.yml`.
- No new env vars; no `--skip-preflight` semantics inside doctor (the command *is* the preflight).
- No extension of `src/cli/parse-args.ts` — doctor parses its own flags like every other subcommand.
- No rate-limit / provider-outage retry work (already implemented).

## Implementation Approach
`runDoctor` is a thin renderer over `runPreflight`. It (1) calls `loadConfig(cwd, env)` inside `try/catch`, returning a non-zero exit + stderr diagnostic on throw; (2) calls `runPreflight({ cfg, workflowName: workflow, env })` — passing `env` so `CYCLE_<AGENT>_BIN` overrides (used by hermetic tests) are honored; (3) formats `checks` (agents then tools, preserving `runPreflight`'s emission order), then `warnings`, then a per-failure remediation footer, into a columnar report; (4) returns `exitCode = result.ok ? 0 : 1`. The `src/cli.ts` block mirrors the `cleanup` dispatch (append a trailing newline to a non-empty `stderr`; write `stdout` verbatim). Because the renderer iterates `result.checks` (which already interleaves the pass/fail per check) and separately lists `result.failures` for the remediation strings, no probing logic is duplicated.

**Report format (pinned).** One row per check: `<kind>  <name-padded>  <STATUS>  <path-or-empty>`, where `kind` ∈ `agent`/`tool` (left-padded to width 6), `name` left-padded to a width computed from the longest check name (min 10), `STATUS` is `ok` (pass) or `FAIL` (fail). Then, for each warning: `warn   <target>  <message>`. Then, if `!result.ok`, a blank line and one `FAIL <name>: <fix>` line per failure, and a trailing summary line `doctor: <N> check(s) failed`. On a clean pass the final line is `doctor: all checks passed`. The internal-failure case renders as a `FAIL preflight: <fix>` line (its `kind` is `internal`, so it appears only in the failures footer, not the checks table — `runPreflight` returns empty `checks` in that path).

## Failure & Resilience Decisions

**Task 1 — `runDoctor` (`src/cli/doctor.ts`)**
- **Failure modes**:
  - `loadConfig` throws (missing/malformed `workflows.yml`) → caught; `runDoctor` returns `{ stdout: "", stderr: <diagnostic>, exitCode: 1 }`. The diagnostic forwards `loadConfig`'s own message (`err.message`, e.g. `workflows.yml missing: <path>`) prefixed with `doctor: could not load config — ` and a `run \`cycle init\` first` hint.
  - `runPreflight` is total and never throws — no catch needed around it; an internal error inside it is already surfaced as a `kind: "internal"` failure, which the renderer prints and counts toward a non-zero exit (never swallowed).
  - A forced-missing/unresolvable agent binary → `runPreflight` records it as a failed check + failure; renderer prints `FAIL`, the failure `fix` string, and `runDoctor` exits non-zero.
- **Idempotency**: fully idempotent — read-only. It calls only `loadConfig` (file read) + `runPreflight` (read-only probes via `spawnSync <bin> --version`). It writes no files, acquires no lock, spawns only harmless `--version` probes. Safe to re-run any number of times; the engine never retries it (it's a terminal subcommand that `process.exit`s).
- **Observability**: all diagnostics go to the returned `stderr`; the report goes to `stdout`. No log-event emission (matches `status`/`cleanup`). The non-zero `exitCode` is the machine-readable failure signal a setup script gates on.
- **No silent failure**: the only throw site (`loadConfig`) is caught and converted to a stderr message + non-zero exit. `runPreflight`'s `internal` failure is rendered, never dropped. No empty-catch, no coerced success.

**Task 2 — `src/cli.ts` dispatch block**
- **Failure modes**: a thrown `import()` or an unexpected throw from `runDoctor` would propagate to the existing top-level process error handling (same as every other dispatch block — none of them wrap `import()`). `runDoctor` itself is designed not to throw. `--workflow` with no following value defaults to `feature` (guarded read of `argv[idx+1]`).
- **Idempotency**: N/A beyond Task 1 — the block writes streams and exits.
- **Observability**: writes `result.stdout`/`result.stderr` to the process streams; exits with `result.exitCode`.
- **No silent failure**: a non-zero `exitCode` from `runDoctor` is propagated via `process.exit(result.exitCode)`.

**Task 3 — docs + coverage-gate registration**: N/A — pure (Markdown/config edits, no runtime failure surface). The `coverage-gate.mjs` `FLOORS` edit is enforced by the existing gate run.

---

## Task 1: `runDoctor` renderer module

### Overview
Create `src/cli/doctor.ts` exporting `runDoctor` — the config-load + preflight-invoke + render + exit-code logic. This is the entire behavioral core of the cycle.

### Changes Required
**File**: `src/cli/doctor.ts` (new)

```ts
import { loadConfig } from "../engine/workflow.ts";
import { runPreflight, type PreflightResult, type PreflightCheck } from "../engine/preflight.ts";

export type DoctorResult = { stdout: string; stderr: string; exitCode: number };

export type DoctorOpts = {
  cwd: string;
  workflow: string;
  /** Override env for CYCLE_<AGENT>_BIN resolution; defaults to process.env. */
  env?: Record<string, string | undefined>;
};

function renderReport(result: PreflightResult): string {
  const lines: string[] = [];
  const nameWidth = Math.max(10, ...result.checks.map((c) => c.name.length));
  for (const c of result.checks) {
    const status = c.ok ? "ok" : "FAIL";
    const tail = c.resolvedPath ?? "";
    lines.push(`${c.kind.padEnd(6)} ${c.name.padEnd(nameWidth)} ${status.padEnd(4)} ${tail}`.trimEnd());
  }
  for (const w of result.warnings) {
    lines.push(`warn   ${w.target.padEnd(nameWidth)} ${w.message}`);
  }
  if (!result.ok) {
    lines.push("");
    for (const f of result.failures) {
      lines.push(`FAIL ${f.name}: ${f.fix}`);
    }
    lines.push(`doctor: ${result.failures.length} check(s) failed`);
  } else {
    lines.push(`doctor: all checks passed`);
  }
  return lines.join("\n") + "\n";
}

export async function runDoctor({ cwd, workflow, env }: DoctorOpts): Promise<DoctorResult> {
  const sourceEnv = env ?? process.env;
  let cfg;
  try {
    cfg = await loadConfig(cwd, sourceEnv);
  } catch (err) {
    const msg = (err as Error).message;
    return {
      stdout: "",
      stderr: `doctor: could not load config — ${msg}\nRun \`cycle init\` first if this repo is not initialized.`,
      exitCode: 1,
    };
  }
  const result = runPreflight({ cfg, workflowName: workflow, env: sourceEnv });
  return { stdout: renderReport(result), stderr: "", exitCode: result.ok ? 0 : 1 };
}
```

Notes:
- Confirm `loadConfig`'s second parameter is the env override (`src/engine/workflow.ts:110` — `loadConfig(repoRoot, env?)`). If `loadConfig` does not accept an env arg, drop the second argument; the `env` is still threaded into `runPreflight`, which is the seam the hermetic tests need.
- `runPreflight`'s `PreflightOpts.env` defaults to `process.env`, so passing `sourceEnv` makes `CYCLE_<AGENT>_BIN` injection deterministic in tests.

### Success Criteria
- [ ] `npm run typecheck` clean (imports `PreflightResult`/`PreflightCheck` types).
- [ ] `npm run build` bundles cleanly.
- [ ] Happy path: a config whose agents/tools resolve → `exitCode === 0`, stdout contains each check name + `ok`, ends with `doctor: all checks passed`.
- [ ] Forced-missing agent (`CYCLE_<AGENT>_BIN=/nonexistent`) → `exitCode !== 0`, stdout contains the agent name, `FAIL`, and the remediation substring `set CYCLE_<AGENT>_BIN to its path`.
- [ ] Unloadable config (temp dir with no `workflows.yml`) → `exitCode !== 0`, `stderr` names the problem, no throw escapes `runDoctor`.
- [ ] No `.cycle/engine.lock` created and no `.cycle/` mutation across a `runDoctor` call.
- [ ] Failure paths surface via `stderr` + non-zero exit — no silent catch.

---

## Task 2: `src/cli.ts` dispatch wiring (`doctor` + `preflight` alias)

### Overview
Add an early-return dispatch block routing `doctor` and `preflight` to `runDoctor`, before `parseArgs`. Both names share one code path (alias).

### Changes Required
**File**: `src/cli.ts`

Insert a block alongside the other subcommand blocks (e.g. after the `cleanup` block at `src/cli.ts:110`):

```ts
if (argv[0] === "doctor" || argv[0] === "preflight") {
  const { runDoctor } = await import("./cli/doctor.ts");
  const rest = argv.slice(1);
  const wfIdx = rest.indexOf("--workflow");
  const workflow = wfIdx >= 0 && rest[wfIdx + 1] ? rest[wfIdx + 1] : "feature";
  const result = await runDoctor({ cwd: process.cwd(), workflow });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}
```

Notes:
- Placed before `parseArgs` (`src/cli.ts:160`) and `acquireLock` (`src/cli.ts:196`), so the command never touches the lock or any state — the structural guarantee for the no-mutation criterion.
- Trailing-newline-on-stderr convention matches `cleanup`/`triage`/`upgrade` (`src/cli.ts:108`).
- Both `doctor` and `preflight` build the identical `runDoctor` call → byte-identical output (alias verified by passing the same args).

**File**: `src/cli.ts` (help text, `src/cli.ts:133-158`)

Add a usage line to the `console.log` template:

```
  cycle doctor [--workflow <name>]
                                Check agent CLIs + tools on demand (alias: preflight); read-only
```

### Success Criteria
- [ ] `node dist/cycle.js doctor` prints a report and exits 0 in this repo.
- [ ] `node dist/cycle.js preflight` prints byte-identical output to `doctor`.
- [ ] `node dist/cycle.js help` lists `cycle doctor`.
- [ ] No `.cycle/engine.lock` is created by either invocation (the block precedes `acquireLock`).
- [ ] `--workflow research` (or any registered workflow) is forwarded into the report's probed agent set; absent `--workflow` defaults to `feature`.

---

## Task 3: Documentation + coverage-gate registration

### Overview
Document `cycle doctor`/`preflight` in `CLAUDE.md`, add an operator-facing `docs/doctor.md`, and register the new module's coverage floor.

### Changes Required
**File**: `CLAUDE.md` — add a row to the Commands table:

```
| `cycle doctor [--workflow <name>]` | Read-only on-demand environment check (alias `cycle preflight`). Reuses `runPreflight`: probes every agent CLI + required tool for the selected workflow (default `feature`), prints a pass/warn/fail report, exits non-zero on any failure. Acquires no lock and mutates no state; warnings do not affect the exit code. See [docs/doctor.md](docs/doctor.md). |
```

**File**: `docs/doctor.md` (new) — operator-facing doc covering: purpose (on-demand preflight without starting the engine), usage (`cycle doctor [--workflow <name>]`, alias `cycle preflight`), example output (the SPEC's report block), exit-code semantics (0 = healthy incl. warnings present, non-zero = any check failed), read-only guarantee (no lock, no state mutation), and that it reuses the engine-start `runPreflight` logic verbatim.

**File**: `scripts/coverage-gate.mjs` — add `src/cli/doctor.ts` to the `FLOORS` table at the 70% line floor tier, matching `src/cli/cleanup.ts` / `src/cli/compress-output.ts`.

**File**: `CLAUDE.md` Coverage policy per-file-floors list — append `src/cli/doctor.ts` (70%) to the enumerated floors paragraph to keep the doc in sync with the gate.

### Success Criteria
- [ ] `CLAUDE.md` Commands table documents `cycle doctor` + `preflight` alias.
- [ ] `docs/doctor.md` exists and describes usage, exit codes, read-only guarantee, alias.
- [ ] `npm run check:coverage` passes with `src/cli/doctor.ts` floor registered (≥70% line).
- [ ] No `docs/cycle/**` artifact path is touched (deliverable is `docs/doctor.md`, in-scope).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running cycle doctor in a healthy initialized repo prints a report listing every agent and tool check with a pass marker and exits 0 — the operator can now diagnose their environment without starting the engine (user-observable benefit).` | Task 1, Task 2 | Renderer iterates `result.checks` (agents then tools) with `ok` markers; exit 0 on clean pass. |
| `[ ] cycle preflight produces byte-identical output to cycle doctor for the same repo/flags (alias verified).` | Task 2 | Both names build the identical `runDoctor` call. |
| `[ ] With an agent forced missing via CYCLE_<AGENT>_BIN pointing at a non-existent path, cycle doctor exits non-zero and the output names the failing binary and includes its remediation string (failure-path criterion).` | Task 1 | `env` threaded into `runPreflight`; failure `fix` printed; exit 1. |
| `[ ] When config cannot be loaded (uninitialized repo), cycle doctor exits non-zero with a clear stderr diagnostic and no unhandled exception / stack trace (failure-path criterion).` | Task 1 | `try/catch` around `loadConfig` → stderr diagnostic + exit 1. |
| `[ ] cycle doctor does not create or modify .cycle/engine.lock, the queue, the log, or any docs/cycle/** file (verified by a no-state-mutation test).` | Task 1, Task 2 | Dispatch block precedes `acquireLock`; `runDoctor` only reads + spawns `--version` probes. |
| `[ ] cycle help output, the CLAUDE.md commands table, and a docs/ entry document cycle doctor (and the preflight alias).` | Task 2, Task 3 | Help-text line + Commands-table row + `docs/doctor.md`. |
| `[ ] All existing tests still pass.` | Task 1, Task 2, Task 3 | No change to existing modules' behavior; engine-start path untouched. |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1, Task 2 | Typed `DoctorResult`/`DoctorOpts`; imports preflight types. |

---

## Testing Strategy

### Unit Tests
**File**: `tests/cli/doctor.test.ts` (new) — `node --test` + `node:assert/strict`, temp-dir per test with `rm(..., { recursive: true, force: true })` in `finally`. Reuse the hermetic helpers from `tests/engine/preflight.test.ts` (`writeFake`, `PASS`/`FAIL` scripts, absolute `CYCLE_<AGENT>_BIN` injection) — drive missing/present agents via env, never PATH-stubbing.

Each test constructs a real initialized temp repo (write a minimal `.cycle/workflows.yml` so `loadConfig` succeeds) and passes an explicit `env` into `runDoctor` so `CYCLE_<AGENT>_BIN` resolution is deterministic.

- **Happy path**: all agents/tools resolve (point each agent's `CYCLE_<AGENT>_BIN` at a `PASS` fake; `git`/`bash` resolve naturally) → `exitCode === 0`, stdout contains each agent/tool name + `ok`, ends with `doctor: all checks passed`. *(exercises the clean-render branch + exit-0 path)*
- **Forced-missing agent** (failure mode: unresolvable binary): set one `CYCLE_<AGENT>_BIN` to an absolute non-existent path → `exitCode !== 0`, stdout contains the agent name, `FAIL`, and the substring `not found on PATH` / `set CYCLE_<AGENT>_BIN to its path`, and the `doctor: N check(s) failed` summary. *(exercises the failure footer + non-zero exit)*
- **Warning present, no failure** (simulated `wsl_shadow`): inject via `runPreflight`'s `procVersion` + `shadowPrefix` seam — since `runDoctor` doesn't expose those, drive this through a `runPreflight` result by pointing an agent `CYCLE_<AGENT>_BIN` at a `PASS` fake under a temp dir and... *given `runDoctor` doesn't thread `procVersion`/`shadowPrefix`, cover the warning-rendering branch with a focused `renderReport` unit test* (export `renderReport` or test via a `runPreflight` result whose `warnings` is non-empty by constructing a fixture `PreflightResult` and calling the exported renderer). Assert the `warn` line is rendered and, with empty `failures`, `exitCode === 0` would hold (verified at the `result.ok` mapping). *(exercises the warning branch + warnings-don't-fail-exit rule)*
- **Unloadable config** (failure mode: `loadConfig` throws): `runDoctor` on a temp dir with no `.cycle/workflows.yml` → `exitCode !== 0`, `stderr` contains `could not load config` and forwards `loadConfig`'s message; assert no throw escapes (`await assert.doesNotReject` / wrap and assert resolved). *(exercises the config-load catch)*
- **No-state-mutation**: assert `.cycle/engine.lock` is absent before and after a `runDoctor` call against the temp repo (and that no new files appear under `.cycle/` beyond the seeded `workflows.yml`). *(exercises read-only guarantee)*
- **Alias dispatch**: a focused test confirming `doctor` and `preflight` route identically — either an in-process test that both argv heads call `runDoctor` with the same opts, or a `spawnSync` of `dist/cycle.js doctor` vs `preflight` asserting equal stdout/exit. Prefer the in-process `runDoctor` assertion to avoid a build dependency; add the subprocess equality check only if cheap.

**Mocking strategy**: no mocking of `runPreflight` or `loadConfig` — use the real implementations against real temp dirs and real `PASS`/`FAIL` fake binaries (anti-mock bias). The only injected seam is `env` (a plain object), which is a first-class `runDoctor`/`runPreflight` parameter, not a mock.

To make the warning-branch test honest without threading `procVersion`/`shadowPrefix` through `runDoctor`, **export `renderReport`** from `doctor.ts` and unit-test it directly with hand-built `PreflightResult` fixtures (clean, failures-only, warnings-only, warnings+failures). This also lifts branch coverage on the renderer cheaply.

### Integration / E2E Tests
- A `spawnSync(process.execPath, [<built cli>, "doctor"])` smoke test in this repo's own environment is optional and environment-dependent (real agent CLIs may be absent) — **skip it** to keep the suite hermetic; the in-process `runDoctor` tests with injected `env` fully cover behavior. No Playwright/UI E2E (no UI surface).

## Risk Assessment
- **`loadConfig` signature mismatch** (does it accept an `env` second arg?): RESEARCH cites `loadConfig(repoRoot, env?)` at `src/engine/workflow.ts:110`. If the env param is absent at implementation time, drop it from the `loadConfig` call — the `env` is still threaded into `runPreflight` (the seam the hermetic tests require), so test determinism is unaffected. *Mitigation*: verify the signature when editing; the fallback is a one-token change.
- **Report format churn breaking tests**: tests assert on substrings (`ok`, `FAIL`, agent name, remediation phrase, `doctor: all checks passed`), not exact column widths, so minor padding tweaks won't break them. *Mitigation*: assert on stable tokens, not byte-exact lines, except the summary line.
- **Coverage floor**: a thin renderer can dip below 95% line if the warning/internal-failure branches are untested. *Mitigation*: the exported `renderReport` fixture tests cover clean/failure/warning/internal branches directly; register the 70% module floor explicitly.
- **Alias divergence**: a future edit could give `preflight` a different code path. *Mitigation*: the dispatch condition is a single `||` building one identical call; the alias test guards against divergence.
