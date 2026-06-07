# Implementation Plan: Cycle 0270

## Overview
Close the `cycle run` false-green on an unknown or value-less `--workflow` by validating the resolved workflow name against the loaded config exactly once at engine start — before `markInProgress`/`runPreflight` — through a single shared helper factored out of `runDoctor`, and wire that same helper into both resume entrypoints so a bad `--workflow` fails loud and cheap instead of burning the attempt budget on a deep `runCycle` throw.

## Current State (from Research)
- `runDoctor` (`src/cli/doctor.ts:62-103`) already carries the three-branch validation inline (`undefined`⇒default `feature`; `""`⇒value-less rejection; not-in-`available`⇒unknown rejection; else passthrough) and emits the two diagnostics `doctor: --workflow requires a value — available workflows: …` and `doctor: unknown workflow "…" — available workflows: …`. This is the logic to extract.
- `cycle run` never validates `args.workflow`. The run-path arg parser (`src/cli/parse-args.ts:43-66`) uses `node:util` `parseArgs` with `workflow: { type: "string", default: "feature" }`, **un-try/caught** — a trailing value-less `--workflow` throws `Option '--workflow <value>' argument missing` uncaught, and the parser cannot distinguish "flag absent" from "flag present, no value".
- `loadConfig` (`src/engine/workflow.ts:109`) returns `Promise<CycleConfig>` and **throws** on a missing/malformed config (the existing config-load failure surface). `const cfg = await loadConfig(cwd)` (`src/cli.ts:293`) is therefore always non-null on the success path; the surrounding `cfg?` usage is over-defensive.
- `runPreflight` (`src/engine/preflight.ts:186`) requires `workflowName: string`; it is called at `src/cli.ts:345`, inside `if (cfg && !args.skipPreflight)` (`:344`). `engine.start` is emitted at `:299`. `markInProgress` is **not** called at engine start — only per-issue at `:863` (main loop) and `:602` (resume).
- Resume entrypoint #1 — `runResumeOnce` resolves `workflowName = tail.workflow || args.workflow` (optionally overridden by `fm.workflow`) and at `src/cli.ts:584-591` a `find` miss emits `engine.warning { reason: "resume_workflow_missing" }` and returns `{ outcome: "skipped" }` (no loud stderr).
- Resume entrypoint #2 — the main-loop per-issue path resolves `workflowName = args.workflow` (overridable by `fm.workflow`, `src/cli.ts:849`) and at `:859` a `find` miss falls through to `spawnRunOne` (`:865`) → the deep `unknown workflow:` throw at `src/engine/run-cycle.ts:376`.
- The epilogue emits exactly one `engine.stop` (`src/cli.ts:1055-1065`) and `process.exit(halted ? 1 : 0)` (`:1066`).
- Tests: `node:test`; `tests/cli/doctor.test.ts:159-241` pins the doctor validation diagnostics and "no `.cycle/` mutation"; `tests/cli/parse-args.test.ts` asserts the `parseArgs` return shape (several `deepEqual` on the full object); run-path integration via `spawnSync("node", [distPath, "run", …])` with `git status --porcelain` cleanliness assertions (`tests/cli/resume.test.ts`).

## Desired End State
- A new exported pure helper `validateWorkflowName(workflow, available, prefix)` returns `{ ok: true, name } | { ok: false, message }`, never throws, and is consumed by both `runDoctor` and the `cycle run` start path.
- `cycle run --workflow <unknown>` and `cycle run --workflow` (value-less) print a `run:`-prefixed diagnostic to stderr and exit non-zero **before** any `engine.start`/preflight/`markInProgress` — zero new log lines, zero queue mutation.
- `cycle run` and `cycle run --workflow feature` behave byte-for-byte as on master.
- Both resume entrypoints reject an unknown resolved `--workflow` via the shared helper before spawning.
- `runDoctor`'s observable behavior (stdout/stderr text, exit codes) is unchanged.
- Verify: new unit tests for the helper; new integration tests for the run-start and resume paths; existing doctor + parse-args tests pass (parse-args tests updated for the new field); `npm run typecheck` clean; coverage floors held.

## What We're NOT Doing
- No change to `runPreflight`, `distinctAgents`, `detectTools`, or `findWorkflow` internals (the false-green is fixed upstream by rejecting before preflight runs).
- No validation of other flags (`--trunk`, `--skip-preflight`, `--dry-run`, etc.).
- No change to `run-one`'s exit-code mapping or the supervisor's teardown/retry/`max_cycle_attempts` policy.
- No change to the `cycle doctor` diagnostic wording (reused as-is, only relocated).
- No new structural-invariants entry (the "same helper" guarantee is enforced by a unit test per SPEC, not a build-time invariant).
- The `--dry-run` preview path (`src/cli.ts:194-213`) is left unguarded — it exits before the lock and never marks in-progress, so a bad workflow there is already a no-mutation preview (noted, not a regression).

## Implementation Approach
Extract the validation into a standalone pure module (`src/cli/validate-workflow.ts`) so both commands import the same symbol — the SPEC's anti-drift requirement — with the command label passed as a `prefix` parameter so `doctor:` output stays byte-for-byte while `run:` reuses the identical message body. Fix `parse-args` to surface a three-state raw signal (`workflowExplicit: undefined | "" | value`) without throwing on a trailing value-less flag, while keeping the resolved `workflow: string` field intact for all downstream consumers (zero type churn). Place the run-start gate immediately after `loadConfig` and **before** `engine.start`, so a rejected workflow writes nothing to the log. Wire the helper into both resume sites: #1 keeps its cheap `skipped` outcome but adds the loud shared-helper stderr line; #2 (which today reaches the deep throw) halts loud and cheap before `markInProgress`/spawn.

## Failure & Resilience Decisions

- **Task 1 — `validateWorkflowName` helper.** N/A — pure. No I/O, no throw for any `string | undefined` input; returns a discriminated result the callers act on.
- **Task 1 — `runDoctor` rewire.** Failure modes: none introduced — the `loadConfig` try/catch (`doctor.ts:65-74`) is unchanged and still owns config-load failure. Idempotency: read-only, unchanged. Observability: identical stderr diagnostics. No silent failure: rejection still returns `exitCode: 1` with stderr.
- **Task 2 — `parse-args`.** Failure modes: a trailing value-less `--workflow` no longer throws uncaught — it resolves to `workflowExplicit: ""` for the gate to reject; genuinely malformed argv for the boolean options still surfaces via `node:util`'s own throw (unchanged for non-workflow options). Idempotency: pure, re-runnable. Observability: the rejection is surfaced downstream by the gate's stderr, not here. No silent failure: the value-less case is converted to a typed signal that the gate rejects loudly — not swallowed.
- **Task 3 — run-start gate.** Failure modes: an unknown/value-less workflow ⇒ `console.error(message)` + `process.exit(2)` before any state mutation; a config-load failure is still owned by the pre-existing `await loadConfig` throw (the gate runs only after a successful load). Idempotency: the gate runs once per invocation, before `markInProgress` and before `engine.start`, so a rejected run mutates no queue row and writes no `cycle.start`/`engine.start`; the lock acquired at `:220` is released on the `process.on("exit")` handler (`:231`) even on the early `process.exit`. Observability: the diagnostic goes to stderr (naming the bad value + available workflows); no log line is the *intended* state for a pre-`engine.start` rejection. No silent failure: error surfaces to stderr + non-zero exit.
- **Task 4 — resume wiring.** Failure modes: resume #1 unknown name ⇒ stderr diagnostic + existing `engine.warning { resume_workflow_missing }` + `outcome: "skipped"` (no `markInProgress` at `:602`, no spawn); resume #2 unknown name ⇒ stderr diagnostic + `engine.halted { reason: "unknown_workflow" }` + halt/`break` before `markInProgress` (`:863`)/spawn. Idempotency: both reject before the in-progress mutation, so re-running is safe; #2 breaks before `popNextPending`'s row is marked, leaving it `pending`. Observability: stderr line + a log event on each path. No silent failure: every miss now surfaces on stderr (previously #1 was a silent `engine.warning` and #2 false-greened into the deep throw).
- **Task 5 — docs.** N/A — pure documentation edits.

---

## Task 1: Extract the shared validation helper and rewire `runDoctor`

### Overview
Create the single source of truth for `--workflow` validation, consumed by both commands, and re-point `runDoctor` onto it with no observable change.

### Changes Required
**File**: `src/cli/validate-workflow.ts` (new)
**Changes**: Export the discriminated result type and the pure helper:
```ts
export type WorkflowValidation =
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * Validate a resolved `--workflow` value against the available workflow names.
 * `undefined` (flag absent) ⇒ default "feature" (never rejected). "" (flag
 * present, no value) ⇒ rejected. An unknown explicit name ⇒ rejected. A known
 * name ⇒ accepted. Pure; never throws for any string/empty/undefined input.
 * `prefix` is the command label embedded in the diagnostic (e.g. "doctor", "run").
 */
export function validateWorkflowName(
  workflow: string | undefined,
  available: string[],
  prefix: string,
): WorkflowValidation {
  const availableList = available.join(", ");
  if (workflow === undefined) return { ok: true, name: "feature" };
  if (workflow === "") {
    return { ok: false, message: `${prefix}: --workflow requires a value — available workflows: ${availableList}` };
  }
  if (!available.includes(workflow)) {
    return { ok: false, message: `${prefix}: unknown workflow "${workflow}" — available workflows: ${availableList}` };
  }
  return { ok: true, name: workflow };
}
```

**File**: `src/cli/doctor.ts`
**Changes**: Import the helper; replace the inline branch block (`doctor.ts:82-99`) with:
```ts
import { validateWorkflowName } from "./validate-workflow.ts";
// …
const v = validateWorkflowName(workflow, cfg.workflows.map((w) => w.name), "doctor");
if (!v.ok) return { stdout: "", stderr: v.message, exitCode: 1 };
const effective = v.name;
```
The `available`/`availableList` locals (`doctor.ts:76-77`) are removed (now internal to the helper). The two emitted messages are byte-for-byte identical (helper with `prefix: "doctor"`).

**File**: `scripts/coverage-gate.mjs`
**Changes**: Add `"src/cli/validate-workflow.ts": 100,` to the `FLOORS` table (pure module, trivially fully covered).

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Helper unit tests pass: unknown name ⇒ `{ ok: false }` with available-workflows message; `""` ⇒ rejection (`--workflow requires a value`); `undefined` ⇒ `{ ok: true, name: "feature" }`; valid explicit name ⇒ `{ ok: true, name }`; never throws for any input.
- [ ] Existing `tests/cli/doctor.test.ts:159-241` pass unchanged (doctor output byte-for-byte preserved).
- [ ] Coverage floor for `src/cli/validate-workflow.ts` (100%) and `src/cli/doctor.ts` (70%) held.
- [ ] Failure paths behave as designed (rejection returns `{ ok: false, message }`; no throw).

---

## Task 2: Distinguish flag-absent from value-less in the run-path arg parser

### Overview
Make `parseArgs` surface a three-state raw `--workflow` signal without throwing on a trailing value-less flag, while keeping the resolved `workflow: string` field for downstream consumers.

### Changes Required
**File**: `src/cli/parse-args.ts`
**Changes**: Add `workflowExplicit: string | undefined` to `RunArgs`. In the run branch, extract the flag manually (parity with the doctor dispatch's `rest[wfIdx + 1] ?? ""`) and strip it from the args fed to `node:util` so a trailing value-less `--workflow` no longer throws and a following flag is not silently consumed as the value:
```ts
const runArgv = argv.slice(1);
const wfIdx = runArgv.indexOf("--workflow");
// Flag absent ⇒ undefined (defaults to "feature"). Flag present, no value ⇒ ""
// (the value-less signal the gate rejects). Mirrors the doctor dispatch.
const workflowExplicit = wfIdx >= 0 ? (runArgv[wfIdx + 1] ?? "") : undefined;
const nodeArgs = wfIdx >= 0
  ? runArgv.filter((_, i) => i !== wfIdx && i !== wfIdx + 1)
  : runArgv;
const { values, positionals } = nodeParseArgs({
  args: nodeArgs,
  options: {
    "dry-run": { type: "boolean", default: false },
    "no-skip-completed": { type: "boolean", default: false },
    trunk: { type: "boolean", default: false },
    "skip-preflight": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: true,
});
// …
return {
  command: "run",
  text: text === "" ? null : text,
  workflow: workflowExplicit === undefined ? "feature" : workflowExplicit,
  workflowExplicit,
  dryRun: Boolean(values["dry-run"]),
  noSkipCompleted: Boolean(values["no-skip-completed"]),
  trunk: Boolean(values.trunk),
  skipPreflight: Boolean(values["skip-preflight"]),
};
```
Note: `workflow` stays a concrete `string` so every existing consumer is unchanged; for the value-less case it is `""` (never read — the gate rejects first and reassigns `args.workflow = v.name` on the success path).

**File**: `tests/cli/parse-args.test.ts`
**Changes**: Update the three full-object `deepEqual` run assertions to include `workflowExplicit: undefined` (the no-text, no-args, and `run <text>` cases). Add cases: `parseArgs(["run","--workflow"])` ⇒ `workflowExplicit === ""`; `parseArgs(["run","--workflow","bug"])` ⇒ `workflowExplicit === "bug"` and `workflow === "bug"`; `parseArgs(["run"])` ⇒ `workflowExplicit === undefined` and `workflow === "feature"`; assert `parseArgs(["run","--workflow"])` does **not** throw.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `cycle run --workflow` (trailing) no longer throws in `parseArgs`; yields `workflowExplicit === ""`.
- [ ] Absent flag ⇒ `workflowExplicit === undefined`, `workflow === "feature"`; explicit value ⇒ both equal the value.
- [ ] All boolean-flag and positional parse tests still pass.
- [ ] Failure paths behave as designed (value-less converted to a typed signal, not swallowed).

---

## Task 3: Wire the gate into the `cycle run` start path

### Overview
Validate the resolved workflow once, immediately after config load and before any log emission or state mutation; reject loud and exit non-zero on failure.

### Changes Required
**File**: `src/cli.ts`
**Changes**: Import the helper (`import { validateWorkflowName } from "./cli/validate-workflow.ts";`). Insert the gate immediately after `const cfg = await loadConfig(cwd);` (`:293`) and **before** `emitStaleDistWarning`/`engine.start` (`:298-299`):
```ts
const wf = validateWorkflowName(args.workflowExplicit, cfg.workflows.map((w) => w.name), "run");
if (!wf.ok) {
  console.error(wf.message);
  process.exit(2);
}
args.workflow = wf.name;
```
This runs after a successful `loadConfig` (config-load failure is still owned by `loadConfig`'s own throw), before `engine.start`, preflight (`:344-372`), and `markInProgress` — so a rejected workflow emits no log line and mutates no queue row. On success `args.workflow` is the concrete validated name, preserving the existing `runPreflight({ cfg, workflowName: args.workflow })` (`:345`) and all downstream reads. Exit code `2` is the usage-rejection code (distinct from generic halt `1` and lock-held `75`).

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `cycle run --workflow nonsense` writes `run: unknown workflow "nonsense" — available workflows: …` to stderr, exits non-zero, emits no `engine.start`/`cycle.start`, and leaves the queue/`log.jsonl` unmutated.
- [ ] `cycle run --workflow` (value-less) writes `run: --workflow requires a value — available workflows: …` to stderr and exits non-zero with no state mutation.
- [ ] `cycle run` and `cycle run --workflow feature` reach preflight/cycle start exactly as on master.
- [ ] Failure paths behave as designed (stderr + non-zero exit, no silent catch, lock released on exit).

---

## Task 4: Wire both resume entrypoints onto the shared helper

### Overview
Reject an unknown resolved `--workflow` (e.g. introduced via `fm.workflow`) at both resume sites before `markInProgress`/spawn, using the same helper.

### Changes Required
**File**: `src/cli.ts` — resume entrypoint #1 (`runResumeOnce`, `:584-591`)
**Changes**: Replace the bare `find` + warning with a helper check that adds the loud stderr line, keeping the cheap `skipped` outcome:
```ts
const wf = validateWorkflowName(workflowName, cfg.workflows.map((w) => w.name), "run");
if (!wf.ok) {
  process.stderr.write(wf.message + "\n");
  await log.emit("engine.warning", { reason: "resume_workflow_missing", workflow: workflowName });
  return { processed: 0, outcome: "skipped" };
}
const wfDef = cfg.workflows.find((w) => w.name === wf.name)!;
```
(`workflowName` here is always a concrete non-empty string, so only the unknown-name branch can fire.)

**File**: `src/cli.ts` — resume entrypoint #2 (main loop, `:859`)
**Changes**: Insert a helper check **before** `markInProgress` (`:863`); on miss, surface loud and halt cheap (no spawn, no in-progress mutation):
```ts
const wf = validateWorkflowName(workflowName, cfg!.workflows.map((w) => w.name), "run");
if (!wf.ok) {
  process.stderr.write(wf.message + "\n");
  await log.emit("engine.halted", { reason: "unknown_workflow", workflow: workflowName, issue_id: row.id });
  halted = true;
  haltReason = "unknown_workflow";
  activeCycleId = undefined;
  break;
}
const wfCfg = cfg!.workflows.find((w) => w.name === wf.name)!;
```
Add the reason to the epilogue `engine.stop` for clarity (`:1060` region):
```ts
...(halted && haltReason === "unknown_workflow" ? { reason: "unknown_workflow" } : {}),
```
The loop breaks before `popNextPending`'s row is marked in-progress (it remains `pending`); the epilogue emits one `engine.stop { status: "halted" }` and `process.exit(1)`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] A resume whose resolved `--workflow` is unknown writes the `run:` diagnostic to stderr; #1 returns `skipped` without `markInProgress`/spawn, #2 halts (`engine.halted { reason: "unknown_workflow" }`, exit 1) without `markInProgress`/spawn — neither reaches the deep `runCycle` throw.
- [ ] A valid resolved workflow on both resume paths proceeds exactly as before.
- [ ] Failure paths behave as designed (stderr + log event on every miss; no silent skip, no attempt burn).

---

## Task 5: Documentation

### Overview
Record that `--workflow` rejection is now shared between `cycle run` and `cycle doctor`, and assert the shared-helper guarantee in a test.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: Update the `cycle run`/`cycle doctor` command-table rows (or the architecture notes) to state that the unknown / value-less `--workflow` rejection is shared via one validation helper (`src/cli/validate-workflow.ts`), and that `cycle run` rejects before marking any issue in-progress (before `engine.start`/preflight).

**File**: `README.md`
**Changes**: If the README documents `cycle run` flags, note the new fail-loud `--workflow` validation parity with `cycle doctor`; otherwise no change (confirm during implementation).

**File**: `tests/cli/validate-workflow.test.ts` (new) — the anti-drift assertion
**Changes**: Beyond the pure-helper unit tests (Task 1), add a "same helper" test satisfying AC#5: (a) behavioral equivalence — assert `runDoctor`'s unknown-name stderr equals `validateWorkflowName(name, available, "doctor").message`; (b) structural reference — read `src/cli/doctor.ts` and `src/cli.ts` source and assert both contain `validateWorkflowName` and import it from `./validate-workflow.ts` / `./cli/validate-workflow.ts`, proving both call sites reference the single exported helper.

### Success Criteria
- [ ] CLAUDE.md and (if applicable) README updated.
- [ ] The "same helper" test passes (both behavioral equivalence and the structural import/reference checks).
- [ ] N/A — pure (documentation/test only).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] cycle run --workflow <unknown> writes a stderr line naming the bad value and listing the available workflows, exits non-zero, and marks no issue in-progress (the queue and log.jsonl show no new cycle.start/in-progress mutation for that invocation). — user-observable benefit` | Task 3 | Gate before `engine.start`/`markInProgress`; helper from Task 1 |
| `[ ] cycle run --workflow (value-less) writes the --workflow requires a value diagnostic to stderr and exits non-zero with no state mutation. — failure-path` | Task 2, Task 3 | parse-args surfaces `workflowExplicit: ""`; gate rejects |
| `[ ] cycle run (no flag) and cycle run --workflow feature proceed exactly as on master (validation is a transparent passthrough for the default and any valid name).` | Task 2, Task 3 | `undefined`⇒`feature`, valid name⇒passthrough+reassign |
| `[ ] A resume invoked with an unknown --workflow fails loud and cheap via the shared helper rather than false-greening into the deep runCycle throw.` | Task 4 | Both resume entrypoints wired |
| `[ ] A unit test asserts runDoctor and the run path consume the same validation helper (the helper is exported and both call sites reference it), so the two commands cannot drift.` | Task 5 | Behavioral-equivalence + structural-reference test |
| `[ ] All existing tests still pass.` | Task 1–5 | parse-args/doctor tests updated/preserved; full suite green |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1–5 | `npm run typecheck` in each task's success criteria |

---

## Testing Strategy

### Unit Tests
- **`validateWorkflowName` (`tests/cli/validate-workflow.test.ts`)**: unknown name ⇒ `{ ok: false }` with `unknown workflow "<name>" — available workflows: …`; `""` ⇒ `{ ok: false }` with `--workflow requires a value — available workflows: …`; `undefined` ⇒ `{ ok: true, name: "feature" }`; valid explicit name ⇒ `{ ok: true, name }`; empty `available` list renders an empty list cleanly; the `prefix` parameter appears verbatim (`"doctor"` vs `"run"`); never throws for `undefined`/`""`/arbitrary strings.
- **Failure-path tests**: value-less and unknown-name are the failure surfaces — covered directly above (helper) and via the run-path integration tests below.
- **`parse-args` (`tests/cli/parse-args.test.ts`)**: absent ⇒ `workflowExplicit === undefined`, `workflow === "feature"`; trailing `--workflow` ⇒ `workflowExplicit === ""` and **does not throw**; `--workflow bug` ⇒ both `"bug"`; updated `deepEqual` cases include `workflowExplicit`.
- **`runDoctor` regression** (`tests/cli/doctor.test.ts:159-241`): re-run unchanged to confirm byte-for-byte diagnostics and "no `.cycle/` mutation" after the rewire.
- **Mocking strategy**: real implementations throughout — temp-dir repos with a real `workflows.yml` (the existing `makeRepo`/`WORKFLOWS_YML` pattern), real `parseArgs`, real `validateWorkflowName`. No mocking required.

### Integration / E2E Tests
- **Run-start gate** (`spawnSync("node", [distPath, "run", "--workflow", "nonsense"], …)` in a temp repo): asserts exit non-zero, stderr matches `/run: unknown workflow "nonsense"/` and `/available workflows:/`, `git status --porcelain` clean, and `log.jsonl` contains **no** new `engine.start`/`cycle.start` line and the queue row is unmutated. Repeat with trailing `--workflow` (value-less) asserting `/--workflow requires a value/`. Control cases: `run --workflow feature --skip-preflight --dry-run`-style valid/default invocations reach the normal path (no rejection).
- **Resume paths**: drive a tail/queue state with a bad resolved workflow (via `fm.workflow` in the issue file) and assert #1 emits the `run:` stderr line + `engine.warning { resume_workflow_missing }` + skips without `markInProgress`, and #2 emits the `run:` stderr line + `engine.halted { reason: "unknown_workflow" }`, exits non-zero, and never spawns `run-one`/reaches the deep throw.

## Risk Assessment
- **`parse-args` flag-stripping changes a `--workflow <flag>` edge case** (e.g. `--workflow --dry-run` now treats `--dry-run` as the workflow value, matching the doctor dispatch's `rest[wfIdx+1] ?? ""` semantics): mitigation — this is an unsupported/typo invocation that now fails loud (unknown workflow `"--dry-run"`) instead of silently mis-parsing; parity with `cycle doctor` is the intended behavior, covered by a parse-args test.
- **Adding `workflowExplicit` breaks `deepEqual` parse-args tests**: mitigation — Task 2 updates those assertions in the same cycle.
- **Gate placement emitting a log line for a rejected run**: mitigation — the gate is inserted before `engine.start` (`:299`), so a rejection writes zero new log lines; an integration test asserts no `engine.start`/`cycle.start` is emitted.
- **Resume #2 halting the whole engine on one bad `fm.workflow`**: mitigation — the start gate already validates the CLI `--workflow` (the SPEC's core scenario), so #2's only trigger is a misconfigured issue frontmatter; halting loud is the correct, cheap surfacing of an operator misconfiguration and avoids both the deep-throw attempt burn and a re-pop loop (the row stays `pending`, never marked in-progress).
