# Implementation Plan: Cycle 0015

## Overview
Deliver an opt-in, token-saving command-output compression path for `claudecode` steps: a new `cycle compress-output -- <cmd>...` filter subcommand plus a `cycle compress-output-hook` classifier subcommand, wired into the claude lane only via a generated `--settings` `PreToolUse` hook that is gated behind a new `engine.compress_output` config flag defaulting to **off**. With the flag off (the default), the `claudecode` invocation is byte-for-byte identical to today.

## Current State (from Research)
- **Subcommand dispatch**: `src/cli.ts:46-109` is a chain of `if (argv[0] === "<name>")` guards that lazily `await import()` a handler returning `{ stdout, stderr, exitCode }`, write the streams, and `process.exit()`. `cycle help` text is the hardcoded template at `src/cli.ts:88-109`.
- **claudecode argv builder**: `src/engine/exec-claudecode.ts:5-22` builds `["--permission-mode","auto", (…--append-system-prompt…), (…--model…), "-p"]` and calls `runAgent`. No `--settings`/hook flag exists today. Any new flag must be inserted **before the trailing `-p`** so the prompt stays last.
- **ExecModule contract**: `src/engine/exec.ts:9-31` — `runStep({ repoRoot, promptPath, env?, model?, thinking?, appendSystemPrompt?, timeoutMs? })`. `claudecode` is the only agent honoring claude-specific extras; others destructure-strip them.
- **Config**: `EngineConfig` at `src/engine/workflow.ts:28-41`; `loadConfig` (`workflow.ts:62-137`) validates structure/`commit.mode`/`defaults` only — it does **no** boolean/numeric coercion of optional fields. Booleans are resolved defensively at the read site (e.g. `cfg?.engine?.skip_completed_on_retry ?? true`, `src/cli.ts:181`). Defaults live in `src/defaults/workflows.yml:3-11`; re-synced via `npm run sync-defaults`.
- **Subprocess discipline**: `spawn`/`spawnSync` with array args, `shell: false` everywhere. `buildChildEnv(extra)` (`src/engine/child-env.ts:16-33`) prepends parent Node's bin dir to PATH and strips all `CYCLE_*` vars.
- **Reuse**: `truncateHeadCapped`/`stripFences` (`src/engine/log-fmt.ts`); `StepResult` shape from `exec-bash.ts`. Per-step claudecode invocation: `src/engine/run-cycle.ts:377-386` (has `cfg`, `log`, `repoRoot`, `cycleEnv`).
- **No existing** compression / `--settings` / `PreToolUse` / hook code — this is greenfield.
- **Test infra**: `node:test` + `node:assert`, `--experimental-strip-types`, one `<module>.test.ts` per module. `node:fs/promises` cannot be `mock.method`-stubbed; use real fs / temp dirs / injectable functions / stub binaries. Coverage floors enforced by `scripts/coverage-gate.mjs` (CLI modules at 70, pure helpers at 90–100).

## Desired End State
- `cycle compress-output -- <cmd>...` exists, spawns the command with array args (no shell), filters stdout when over threshold, passes stderr through verbatim, and propagates the child exit code.
- `cycle compress-output-hook` exists, reads a `PreToolUse` JSON event from stdin, and emits a rewrite that wraps allowlisted operator-free read commands through `cycle compress-output` — failing open on any error.
- `engine.compress_output` exists in the config type and defaults (`false`); when `=== true`, `claudecode` steps run with a generated `--settings <path>` registering the `PreToolUse` hook; when absent/false/non-boolean, no settings file is written and the claude argv is identical to the pre-change baseline.
- Docs (CLAUDE.md, README.md, docs/ENGINE.md) updated; `.cycle/` re-synced.
- **Verify**: `npm test` (full suite + coverage + invariants) green; `npm run typecheck` clean; new per-file floors met; the baseline argv assertion in `tests/engine/exec-claudecode.test.ts` proves default-off byte-identity.

## What We're NOT Doing
- No compression for `codex`, `gemini`, `auggie`, `opencode`, `pi`, or `bash` steps — claude lane only.
- No binary/gzip compression of artifacts or logs — this is a text density filter only.
- No modification of captured `SPEC.md`/`PLAN.md`/`BUILD.md`/… step artifacts or the `step.end` log excerpt — only the agent's in-context Bash tool output is affected.
- No RFC-005 runtime-enforced step contracts — this only lays the first `PreToolUse`-hook usage.
- No new engine agent; the valid-agent set (`knownAgents() + bash`) is unchanged.
- No new `engine.*` sub-keys for filter tuning — threshold/head/tail are `compress-output` CLI flags with documented defaults (sufficient for the "MUST be configurable" requirement without config-surface creep).
- No structural invariant for the default-off contract — the `exec-claudecode.test.ts` baseline argv assertion is the contract guard (per SPEC's own note that this "may suffice").

## Implementation Approach
Keep all token-saving logic in a **pure, fully-unit-tested module** (`src/engine/compress-filter.ts`): the density filter, the command classifier, the settings-object builder, and the rewrite-command builder are all deterministic functions over strings. Two thin CLI handlers (`compress-output`, `compress-output-hook`) wrap I/O around those pure functions and return `{ stdout, stderr, exitCode }` per the existing subcommand convention. Wiring is additive and gated: `run-cycle` resolves the boolean defensively (`cfg.engine.compress_output === true`), and only for `claudecode` steps materializes the settings file (with a log event on failure) and passes a `settingsPath` down the existing `runStep` contract; `exec-claudecode` appends `--settings <path>` before `-p` only when `settingsPath` is present. The hook command and the rewrite both use absolute `process.execPath` + `process.argv[1]` so `cycle` is always resolvable, guaranteeing fail-open behavior.

## Failure & Resilience Decisions

**`compressOutput` / `classifyCommand` / `buildCompressHookSettings` / `buildRewriteCommand` (pure, `src/engine/compress-filter.ts`)** — N/A — pure. Deterministic string transforms, no I/O, no failure surface. (Determinism is itself a SPEC requirement and is test-pinned.)

**`runCompressOutput` (`src/cli/compress-output.ts`)** — spawns the wrapped command.
- **Failure modes**: (a) no command after `--` → write usage/error to stderr, exit non-zero (2), spawn nothing; (b) missing binary (`spawnSync` returns `error`, no exit code) → surface the error message to stderr, exit `127`; (c) wrapped command exits non-zero → propagate that exact exit code, write child stderr verbatim, still print filtered stdout. The filter never removes stderr content or stdout lines matching the error pattern.
- **Idempotency**: re-runnable — it only spawns allowlisted read-only commands (`git status`, `ls`, …) and writes nothing to disk. The engine never retries this subcommand directly (claude's Bash tool invokes it); re-execution re-reads current state, which is the intended behavior.
- **Observability**: child stderr is passed through verbatim to the subcommand's stderr; the exit code is the child's; usage errors print a clear message naming the missing `--`/command.
- **No silent failure**: every error path sets a non-zero exit code and writes to stderr; nothing is swallowed.

**`runCompressOutputHook` (`src/cli/compress-output-hook.ts`)** — classifies a `PreToolUse` event.
- **Failure modes**: malformed/empty stdin JSON, missing `tool_input.command`, non-Bash tool, non-allowlisted binary, or any shell metacharacter → emit **no** rewrite (empty stdout), exit 0. This is fail-open: the original command runs unchanged.
- **Idempotency**: pure given its stdin string; no disk/network/process side effects. Safe to re-run.
- **Observability**: exit code is always 0 (never blocks a tool call); the only effect is an optional `updatedInput` JSON on stdout. A forced classifier/parse error degrades to passthrough, asserted by test.
- **No silent failure**: failure to rewrite is the *designed, safe* outcome (fail-open), not a swallowed error — there is no error condition that should ever surface as a non-zero exit, because doing so would block a legitimate `claudecode` Bash call.

**Settings materialization in `run-cycle` (`writeCompressHookSettings`)** — writes `.cycle/compress-hook-settings.json` for claudecode steps when the flag is on.
- **Failure modes**: `writeFile` fails (permissions, disk) → emit `step.warning { cycle_id, step, reason: "compress_hook_settings_failed", error }` and proceed **without** `settingsPath`, so the claude step runs normally (compression simply doesn't apply that step).
- **Idempotency**: writes the same JSON content every step (overwrite); a derived `.cycle/` file with no lifecycle state — safe under engine step retries/restarts. No cleanup needed.
- **Observability**: the warning event names the cycle, step, and error; the absence of `--settings` on that step is the observable degradation.
- **No silent failure**: the write failure surfaces as a logged `step.warning`; the engine continues by design (fail-open).

**`exec-claudecode` argv addition** — N/A — pure. Conditionally appends two argv tokens (`--settings`, path) before `-p` when `settingsPath` is provided; no I/O, no new failure surface.

**`engine.compress_output` config read** — N/A — pure. Resolved defensively at the read site as `cfg.engine.compress_output === true`; absent/non-boolean/malformed all evaluate to `false`. `loadConfig` is unchanged and adds no throw path.

---

## Task 1: Pure compress-filter module

### Overview
Create the deterministic core: density filter, command classifier, claude-settings builder, rewrite-command builder, and documented default constants. No I/O.

### Changes Required
**File**: `src/engine/compress-filter.ts` (new)
**Changes**:
- Constants (documented defaults): `DEFAULT_THRESHOLD_BYTES = 4000`, `DEFAULT_HEAD_LINES = 40`, `DEFAULT_TAIL_LINES = 20`.
- `ALLOWLIST = new Set(["git","ls","cat","grep","rg","diff","head","tail","wc","tree","stat"])` (read-oriented binaries).
- `DENY_PATTERN = /[|&;<>$`(){}\n\r]/` (any shell operator/metachar ⇒ not rewritable).
- `ERROR_LINE_PATTERN = /\b(error|fatal|fail(ed|ure)?|denied|cannot|no such|warning)\b/i`.
- `compressOutput(stdout: string, opts?: { thresholdBytes?; headLines?; tailLines? }): { text: string; compressed: boolean }`:
  - If `Buffer.byteLength(stdout) <= threshold` → return `{ text: stdout, compressed: false }` (verbatim passthrough).
  - Else split into lines; if `lines.length <= headLines + tailLines` → passthrough (`compressed: false`) — no line-elidable middle (long-line case documented).
  - Else: `head = lines[0..headLines]`, `tail = lines[len-tailLines..]`, `middle = the rest`. `retained = middle.filter(l => ERROR_LINE_PATTERN.test(l))` (original order); `elided = middle.filter(l => !ERROR_LINE_PATTERN.test(l))`. Output = `head ++ [marker] ++ retained ++ tail` joined by `\n`, where `marker = "[… ${elided.length} lines/${Buffer.byteLength(elided.join("\n"))} bytes elided …]"`. Return `{ text, compressed: true }`.
- `classifyCommand(command: string): { rewrite: boolean }`:
  - `const c = command.trim()`; reject (`rewrite:false`) if empty, if `DENY_PATTERN.test(c)`, or if the first whitespace-delimited token is not in `ALLOWLIST`. Otherwise `rewrite:true`.
- `buildRewriteCommand({ execPath, cliPath, command }): string` → `` `${q(execPath)} ${q(cliPath)} compress-output -- ${command.trim()}` `` where `q` wraps in double quotes (paths only).
- `buildCompressHookSettings({ execPath, cliPath }): object` → `{ hooks: { PreToolUse: [ { matcher: "Bash", hooks: [ { type: "command", command: `${q(execPath)} ${q(cliPath)} compress-output-hook` } ] } ] } }`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Unit tests pass (Task 1 tests below).
- [ ] Above-threshold input yields head + tail + a single elision marker with correct `lines`/`bytes` math; error-pattern middle lines are retained.
- [ ] At/below-threshold and few-lines inputs pass through verbatim (`compressed:false`, no marker).
- [ ] `classifyCommand` rewrites allowlisted operator-free commands and rejects shell-operator/non-allowlisted commands.
- [ ] Failure paths behave as designed (N/A — pure; determinism asserted).

---

## Task 2: `cycle compress-output` subcommand

### Overview
Spawn the wrapped command with array args, filter stdout, surface stderr/exit code, handle the no-command usage error.

### Changes Required
**File**: `src/cli/compress-output.ts` (new)
- `export type CompressOutputResult = { stdout: string; stderr: string; exitCode: number }`.
- `export function runCompressOutput(argv: string[], spawnFn = spawnSync): CompressOutputResult`:
  - Parse optional flags before `--`: `--threshold-bytes`, `--head-lines`, `--tail-lines` (numeric; invalid/malformed → fall back to defaults).
  - Locate `--`; if absent or no tokens follow → `{ stdout:"", stderr:"usage: cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd> [args...]\n", exitCode: 2 }` (spawn nothing).
  - `const [bin, ...rest] = cmd`; `const res = spawnFn(bin, rest, { shell: false, encoding: "utf8", env: buildChildEnv({}), maxBuffer: 64*1024*1024 })`.
  - If `res.error` (e.g. ENOENT) → `{ stdout:"", stderr: String(res.error.message) + "\n", exitCode: 127 }`.
  - Else `const { text } = compressOutput(res.stdout ?? "", { thresholdBytes, headLines, tailLines })`; return `{ stdout: text, stderr: res.stderr ?? "", exitCode: res.status ?? 0 }` (child stderr verbatim, exit code propagated).
- Inject `spawnFn` for tests (default `spawnSync` from `node:child_process`).

**File**: `src/cli.ts`
- Add guard after the `cleanup` block (before `help`):
  ```ts
  if (argv[0] === "compress-output") {
    const { runCompressOutput } = await import("./cli/compress-output.ts");
    const result = runCompressOutput(argv.slice(1));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }
  ```
- Add a usage line to the `cycle help` template: `cycle compress-output -- <cmd>   Run <cmd> and density-filter its stdout (token saver)`.

### Success Criteria
- [ ] Compiles/builds cleanly.
- [ ] Above-threshold stub command → filtered output (head + tail + marker) and exits with the wrapped exit code.
- [ ] Below-threshold output → verbatim, exit 0.
- [ ] Non-zero-exit stub → same non-zero exit code; child stderr present (not dropped).
- [ ] No-command usage → non-zero exit, stderr usage message, `spawnFn` not called (assert with a spy).
- [ ] Missing-binary stub (`res.error`) → exit 127, error surfaced to stderr.
- [ ] `tests/cli/help.test.ts` updated and passing for the new usage line.

---

## Task 3: `cycle compress-output-hook` subcommand (fail-open classifier)

### Overview
Read a `PreToolUse` event from stdin, classify the command, emit a rewrite for allowlisted operator-free read commands, fail open on everything else.

### Changes Required
**File**: `src/cli/compress-output-hook.ts` (new)
- `export type HookResult = { stdout: string; exitCode: number }`.
- `export function runCompressOutputHook(stdinJson: string, ctx: { execPath: string; cliPath: string }): HookResult`:
  - `try`: `const evt = JSON.parse(stdinJson)`; `const command = evt?.tool_input?.command`; if `typeof command !== "string"` → return `{ stdout:"", exitCode:0 }` (passthrough); `if (!classifyCommand(command).rewrite)` → `{ stdout:"", exitCode:0 }`; else build `updatedCommand = buildRewriteCommand({ ...ctx, command })` and return `{ stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { command: updatedCommand } } }), exitCode: 0 }`.
  - `catch` → `{ stdout:"", exitCode:0 }` (fail open; never block a tool call).

**File**: `src/cli.ts`
- Add guard (reads stdin fully, then delegates):
  ```ts
  if (argv[0] === "compress-output-hook") {
    const { runCompressOutputHook } = await import("./cli/compress-output-hook.ts");
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    const result = runCompressOutputHook(Buffer.concat(chunks).toString("utf8"),
      { execPath: process.execPath, cliPath: process.argv[1] });
    if (result.stdout) process.stdout.write(result.stdout);
    process.exit(result.exitCode);
  }
  ```
- (Internal command; not listed in `cycle help`.)

### Success Criteria
- [ ] Compiles/builds cleanly.
- [ ] Allowlisted operator-free command (e.g. `git status`) → emits `updatedInput.command` wrapping it through an absolute-path `compress-output`, exit 0.
- [ ] Command with a shell operator or non-allowlisted binary → empty stdout, exit 0 (passthrough).
- [ ] Malformed JSON / missing `tool_input.command` → empty stdout, exit 0 (fail open).
- [ ] Failure paths behave as designed: forced parse error never throws, never exits non-zero (asserted).

---

## Task 4: `engine.compress_output` config flag + defaults

### Overview
Declare the optional flag, default it off, sync defaults. No new validation/throw in `loadConfig`.

### Changes Required
**File**: `src/engine/workflow.ts`
- Add to `EngineConfig` (`workflow.ts:28-41`): `/** Opt-in: route claudecode Bash read-commands through cycle compress-output. Default false; absent/non-boolean ⇒ false (resolved at read site). claudecode-only, fail-open. */ compress_output?: boolean;`
- No change to `loadConfig` body — it performs no per-field boolean coercion (consistent with existing optional booleans).

**File**: `src/defaults/workflows.yml`
- Add under `engine:` (line ~8): `compress_output: false`.

**Then**: run `npm run sync-defaults` so `.cycle/workflows.yml` reflects the key.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `tests/engine/workflow.test.ts`: `loadConfig` returns `compress_output === false` from defaults; a config omitting the key loads without throwing and `cfg.engine.compress_output` is `undefined`; a non-boolean value loads without throwing (coercion is the read site's job).
- [ ] `.cycle/workflows.yml` contains `compress_output: false` after sync; `tests/defaults/*` (sync parity) green.
- [ ] No new throw path introduced in `loadConfig`.

---

## Task 5: Wire the hook into the claude lane (gated, default-off byte-identical)

### Overview
Plumb a `settingsPath` through the `runStep` contract; `run-cycle` materializes the settings file for `claudecode` steps only when `compress_output === true`; `exec-claudecode` appends `--settings <path>` before `-p` when present.

### Changes Required
**File**: `src/engine/exec.ts`
- Add to the `runStep` args interface: `/** Honored only by claudecodeExec: absolute path to a generated claude --settings file (compress-output hook). */ settingsPath?: string;`

**File**: `src/engine/exec-claudecode.ts`
- Destructure `settingsPath`: `async runStep({ appendSystemPrompt, model, thinking, settingsPath, ...args })`.
- After the `--model` push and **before** `argv.push("-p")`: `if (settingsPath) argv.push("--settings", settingsPath);`
- Pass `...args` to `runAgent` as today (so `settingsPath` never leaks into `runAgent`).

**File**: `src/engine/run-cycle.ts`
- Near the per-step claudecode invocation (`run-cycle.ts:359-386`):
  - Resolve once per step: `const compressOn = cfg.engine.compress_output === true;`
  - For `claudecode` steps when `compressOn`, materialize settings before `runStep`:
    ```ts
    let settingsPath: string | undefined;
    if (compressOn && step.agent === "claudecode") {
      try {
        const obj = buildCompressHookSettings({ execPath: process.execPath, cliPath: process.argv[1] });
        const p = join(repoRoot, ".cycle", "compress-hook-settings.json");
        await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
        settingsPath = p;
      } catch (err) {
        await log.emit("step.warning", { cycle_id: cycleId, step: step.name,
          reason: "compress_hook_settings_failed", error: (err as Error).message });
        // fail open: proceed without --settings
      }
    }
    ```
  - Pass `settingsPath` into the `mod.runStep({ … })` call.
- Import `buildCompressHookSettings` from `./compress-filter.ts`; `writeFile` from `node:fs/promises` (already imported in run-cycle, else add).

**File**: `tests/engine/exec-claudecode.test.ts`
- Add: with no `settingsPath` (and existing permutations), assert the exact argv has **no** `--settings` token — the pre-change baseline. With `settingsPath` set, assert `--settings <path>` appears immediately before `-p`.

### Success Criteria
- [ ] `npm run typecheck` clean; build clean.
- [ ] Default-off / no-`settingsPath` path: claude argv byte-for-byte identical to baseline (asserted, covers SPEC criterion 4).
- [ ] `settingsPath` present → `--settings <path>` inserted before `-p`; `-p` stays last; prompt still last.
- [ ] `run-cycle` test: with `compress_output: true`, a claudecode step writes `.cycle/compress-hook-settings.json` and passes `settingsPath`; with the flag off/absent, no file is written and `settingsPath` is undefined.
- [ ] Settings-write failure emits exactly one `step.warning { reason: "compress_hook_settings_failed" }` and the step still runs (fail-open), asserted with `filter(...).length === 1`.
- [ ] Non-claudecode agents never receive `settingsPath`.

---

## Task 6: Coverage floors, docs, and sync

### Overview
Register per-file floors for new modules and complete required documentation.

### Changes Required
**File**: `scripts/coverage-gate.mjs` (`FLOORS` table)
- Add: `"src/engine/compress-filter.ts": 100`, `"src/cli/compress-output.ts": 70`, `"src/cli/compress-output-hook.ts": 70`.

**File**: `CLAUDE.md`
- Commands table: add `cycle compress-output -- <cmd>` (run a read command and density-filter its stdout; token saver; claudecode-only opt-in).
- *Workflow defaults* list: add `engine.compress_output` (default `false`, claudecode-only, fail-open, claude `--settings` `PreToolUse` hook).
- Per-file floors line: append the three new floors.
- Agent/model note: the compression hook is **claude-lane-only** (`exec-claudecode.ts` via `--settings`); other agents unaffected.

**File**: `README.md`
- Surface the opt-in flag: enable with `engine.compress_output: true`; explain it routes allowlisted read commands through `cycle compress-output` to save context tokens; default off = unchanged behavior.

**File**: `docs/ENGINE.md`
- New section documenting: the `compress-output` filter contract (threshold 4000 B, head 40 / tail 20 lines, `[… N lines/B bytes elided …]` marker, error-line + stderr retention, exit-code propagation, no-command usage error), and the `PreToolUse` hook (generated `.cycle/compress-hook-settings.json`, classifier allowlist + metacharacter denylist, absolute-path rewrite, fail-open on hook/classifier/parse error, `step.warning { reason: "compress_hook_settings_failed" }` on settings-write failure).

**Then**: `npm run sync-defaults` (already run in Task 4; re-confirm `.cycle/` parity).

### Success Criteria
- [ ] `npm run check:coverage` passes with the three new floors met.
- [ ] `npm run check:invariants` passes (no new invariant added).
- [ ] Docs reflect the subcommand, the flag, defaults, and fail-open semantics.
- [ ] `npm test` (full suite) green; `npm run typecheck` clean.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Running `cycle compress-output -- git status` (or a stub command) with stdout above the threshold prints a filtered output containing the head, the tail, and an elision marker, and exits with the wrapped command's exit code. | Task 1, Task 2 | Filter logic (T1) + subcommand spawn/exit-propagation (T2) |
| [ ] Running `cycle compress-output` against output below the threshold prints the output verbatim (no marker), and exits 0. | Task 1, Task 2 | Below-threshold passthrough |
| [ ] A wrapped command that exits non-zero causes `cycle compress-output` to exit with that same non-zero code, and its stderr/error lines appear in the output (not dropped). | Task 2, Task 1 | Exit-code propagation + verbatim stderr (T2); error-line retention in stdout (T1) |
| [ ] With `engine.compress_output` absent or `false`, the `claudecode` invocation registers no `PreToolUse` hook — verified by an assertion that the claude argv/settings are identical to the pre-change baseline. | Task 5 | Baseline argv assertion in `exec-claudecode.test.ts` |
| [ ] **Failure-path**: invoking `cycle compress-output` with no command argument exits non-zero and writes a usage/error message to stderr while spawning nothing; and a forced hook-script failure leaves the underlying command running unmodified (fail-open), asserted by test. | Task 2, Task 3 | No-command usage error + spawn-not-called (T2); hook fail-open on forced error (T3) |
| [ ] All existing tests still pass. | Task 2, Task 4, Task 5, Task 6 | `help.test.ts`, `workflow.test.ts`, defaults parity, full `npm test` |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1–6 | Typecheck gate after each task |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/compress-filter.test.ts`** (pure, target 100%):
  - Above-threshold many-line input → head/tail present, exactly one marker, `lines`/`bytes` math correct; error-pattern middle lines retained.
  - At-threshold and below-threshold → verbatim, `compressed:false`, no marker.
  - Few-lines-but-large-bytes (long lines) → passthrough (documented edge).
  - `classifyCommand`: each allowlisted binary rewrites; each metacharacter in `DENY_PATTERN` (`|`, `>`, `<`, `&`, `;`, `$`, backtick, parens, braces, newline) forces passthrough; non-allowlisted binary (`rm`, `curl`) passthrough; empty/whitespace passthrough.
  - `buildRewriteCommand` / `buildCompressHookSettings`: absolute-path quoting and exact JSON shape.
- **`tests/cli/compress-output.test.ts`** (floor 70):
  - Injected `spawnFn` returning large stdout → filtered; small stdout → verbatim; non-zero `status` → propagated with stderr; `res.error` → exit 127; no-`--` argv → exit 2 and assert `spawnFn` **not** called (spy).
- **`tests/cli/compress-output-hook.test.ts`** (floor 70):
  - Valid Bash event with allowlisted command → `updatedInput` JSON; operator/non-allowlisted command → empty stdout; malformed JSON and missing `command` → empty stdout, exit 0 (fail open).
- **`tests/engine/exec-claudecode.test.ts`**: baseline (no `settingsPath`) argv identical; with `settingsPath` → `--settings <path>` before `-p`.
- **`tests/engine/workflow.test.ts`**: `compress_output` default `false`; absent key → `undefined`, no throw; non-boolean value → no throw.
- **`tests/cli/help.test.ts`**: new usage line present.

Failure-path coverage maps 1:1 to the named failure modes: no-command (T2), missing binary (T2), non-zero child exit (T2), hook parse error/passthrough (T3), settings-write failure (T5).

**Mocking strategy**: prefer real implementations — pure functions tested directly; `compress-output` uses an injected `spawnFn` (or a real stub binary via array args) rather than stubbing `node:child_process`; `compress-output-hook` is driven by a real stdin string. The settings-write failure path uses a real temp dir made unwritable (`chmod`) or an injected failing writer, never `mock.method` on `node:fs/promises` (per test conventions).

### Integration / E2E Tests
- **`run-cycle` integration**: with `compress_output: true`, run a claudecode step (stubbed exec) and assert `.cycle/compress-hook-settings.json` is written and `settingsPath` reaches `runStep`; with the flag off, assert no file and no `settingsPath`. Assert the settings-write-failure path emits exactly one `step.warning` (cardinality-pinned) and the step still proceeds.
- No UI surface — no Playwright/E2E required (per SPEC).

## Risk Assessment
- **Claude CLI `--settings` `PreToolUse` rewrite schema differs across installed versions**: mitigated by fail-open design — the hook only emits an optional `updatedInput`; if the installed claude ignores or doesn't support it, the original command runs unchanged and the engine stays functional (the default-off path is the contract that's test-pinned, not live rewrite behavior).
- **`run-cycle` 90% coverage floor regression from new branch**: mitigated by the dedicated `run-cycle` integration tests covering both flag states and the write-failure warning.
- **Allowlist too broad (mutating `git` subcommands wrapped)**: harmless — `compress-output` always runs the command and only filters stdout; small-output mutating commands fall below threshold and pass through verbatim. Conservative denylist blocks all shell composition.
- **Large child stdout exceeding `spawnSync` buffer**: mitigated by an explicit `maxBuffer: 64 MiB`; over-buffer surfaces as `res.error` → exit 127 with a clear stderr message (no silent truncation).
