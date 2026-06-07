# Implementation Plan: Cycle 0266

## Overview
Make `cycle doctor` / `cycle preflight` fail loud on an unknown or value-less `--workflow` name: validate the resolved workflow name against the loaded config inside `runDoctor` (before any preflight probing), returning a non-zero `DoctorResult` whose stderr names the bad value and lists the config-derived available workflows — while preserving the no-arg `feature` default byte-for-byte.

## Current State (from Research)
- Dispatch at `src/cli.ts:117-126` parses `--workflow`; the resolver `wfIdx >= 0 && rest[wfIdx + 1] ? rest[wfIdx + 1] : "feature"` (`:121`) silently falls back to `feature` for a trailing value-less flag and forwards any arbitrary name with no existence check.
- `runDoctor` (`src/cli/doctor.ts:52-67`) loads config via `loadConfig`, then passes `workflow` straight into `runPreflight` (`:65`) with no name validation. Config-load failure returns `{ stdout:"", stderr:"doctor: …", exitCode:1 }` — the error-result pattern to mirror.
- `findWorkflow` returns `undefined` for unknown names; `distinctAgents`/`detectTools` then silently degrade to triage-agent + `bash`/`git`, producing a false `doctor: all checks passed` (exit 0). This degrade mechanism is **out of scope** and must not change.
- Valid names live in `cfg.workflows: Workflow[]`, each with `name: string` (`src/engine/workflow.ts:88-91`, `25-29`). `loadConfig` is already imported in `doctor.ts`.
- `DoctorOpts.workflow` is a plain `string` with no sentinel for "user gave no value".
- Tests: `tests/cli/doctor.test.ts` drives `runDoctor` directly with hermetic absolute `CYCLE_<AGENT>_BIN` fakes; `makeRepo()` writes a single-`feature`-workflow YAML. No test exercises `--workflow` dispatch parsing, unknown-name, or value-less-flag cases. Coverage floor: `src/cli/doctor.ts` 70%.

## Desired End State
- `cycle doctor --workflow no_such_wf` exits non-zero; stderr contains `no_such_wf` and the available-workflow names; no probe runs.
- `cycle doctor --workflow` (trailing, no value) exits non-zero with the same workflow-validation error path, not `feature`.
- Bare `cycle doctor` / `cycle preflight` still resolve to `feature` and probe it.
- `cycle doctor --workflow <real-name>` probes that workflow (verifiably distinct from `feature`).
- Validation runs after config-load and before `runPreflight`; the command remains read-only.
- Verify: `npm test` passes, `npm run typecheck` clean, new dispatch/validation tests in `tests/cli/doctor.test.ts` pass.

## What We're NOT Doing
- No change to `runPreflight` probing logic, `findWorkflow`, `distinctAgents`/`detectTools` degrade-to-default behavior, the `AGENT_BINARY` table, or `renderReport`.
- No validation of any other `doctor` flag; no new flags.
- No change to engine-start preflight in `src/cli.ts` (its workflow name comes from validated config).
- No `.cycle/log.jsonl` events for the on-demand doctor path (stderr-only diagnostics, matching today).
- No change to the existing config-load failure path.

## Implementation Approach
Validation lives **inside `runDoctor`** (not the inline dispatch expression), because the dispatch site has no unit harness and the SPEC's testing strategy favors calling `runDoctor` directly. To let `runDoctor` distinguish the three cases without rejecting the no-arg default, `DoctorOpts.workflow` becomes **optional** (`workflow?: string`) with this contract:
- `workflow === undefined` → no `--workflow` flag → resolve to `"feature"` (unchanged default path; no validation rejection possible).
- `workflow` is an explicit string (including `""`) → a user-supplied value → validate against the config workflow set; reject if empty (value-less flag) or unknown.

The dispatch encodes the signal: no flag ⇒ `undefined`; flag present with no following token ⇒ `""` (distinct from `undefined`); flag with a token ⇒ that token.

Order inside `runDoctor`: existing config-load try/catch (unchanged, runs first so the available-names list is derivable) → workflow-name validation → `runPreflight`. This keeps the config-load failure path first/unchanged and guarantees validation precedes probing.

## Failure & Resilience Decisions

**Task 1 — `DoctorOpts` contract + dispatch parsing (`src/cli.ts`)**
- **Failure modes**: malformed argv is the only surface. A value-less `--workflow` resolves to `""` (deliberate, routed to the validation error). No I/O, no subprocess here.
- **Idempotency**: pure argv→string parsing; safe to re-run.
- **Observability**: the resulting error surfaces via `runDoctor`'s stderr + non-zero exit; the dispatch writes `result.stderr` and exits `result.exitCode` (existing behavior).
- **No silent failure**: the previous silent `feature` fallback for a value-less flag is removed — it now routes to a non-zero exit. No error swallowed.

**Task 2 — validation in `runDoctor` (`src/cli/doctor.ts`)**
- **Failure modes**: (a) config cannot load → existing try/catch returns `exitCode:1` with the existing message (unchanged); (b) value-less flag (`workflow === ""`) → return `exitCode:1`, stderr names the missing value + lists available workflows; (c) unknown name → return `exitCode:1`, stderr names the bad value + lists available workflows. All three return a `DoctorResult`; `runDoctor` still **never throws**.
- **Idempotency**: read-only — `loadConfig` reads config; validation is in-memory; no lock, no state mutation, no probe on the rejection paths. Fully re-run-safe.
- **Observability**: every rejection writes a `doctor: …`-prefixed stderr line and a non-zero exit code. No `.cycle/log.jsonl` event (consistent with the existing doctor path).
- **No silent failure**: the false-green degrade path is bypassed for explicit names; an unknown/empty name can no longer reach `runPreflight`. Errors surface on stderr with non-zero exit.

**Task 3 — tests (`tests/cli/doctor.test.ts`)**: N/A — test code (failure surfaces are the assertions themselves).

---

## Task 1: Make `DoctorOpts.workflow` optional and encode the dispatch signal

### Overview
Change the public contract so `runDoctor` can tell "no flag" from "value-less flag" from "explicit name", and rewrite the dispatch parser to stop silently defaulting a value-less flag to `feature`.

### Changes Required
**File**: `src/cli/doctor.ts`
**Changes**: Make the field optional:
```ts
export type DoctorOpts = {
  cwd: string;
  /** Resolved workflow name. `undefined` ⇒ no --workflow flag (defaults to "feature"). An explicit string (incl. "") ⇒ user-supplied, validated against config. */
  workflow?: string;
  env?: Record<string, string | undefined>;
};
```

**File**: `src/cli.ts` (dispatch block `:117-126`)
**Changes**: Replace the value resolver so a value-less flag becomes `""` (distinct from no-flag `undefined`):
```ts
const wfIdx = rest.indexOf("--workflow");
let workflow: string | undefined;
if (wfIdx >= 0) {
  // Value-less trailing flag (no following token) ⇒ "" so runDoctor rejects it
  // rather than silently defaulting to "feature".
  workflow = rest[wfIdx + 1] ?? "";
}
const result = await runDoctor({ cwd: process.cwd(), workflow });
```
(No flag ⇒ `workflow` stays `undefined`.)

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`)
- [ ] `npm run typecheck` clean
- [ ] No-flag dispatch passes `workflow: undefined`; value-less flag passes `""`; `--workflow x` passes `"x"`
- [ ] Failure paths behave as designed (value-less flag no longer silently defaults)

---

## Task 2: Validate the resolved workflow name inside `runDoctor`

### Overview
After the existing config-load try/catch and before `runPreflight`, resolve the effective workflow and reject an empty (value-less) or unknown explicit name with a non-zero `DoctorResult` whose stderr lists the config-derived available workflows.

### Changes Required
**File**: `src/cli/doctor.ts` (`runDoctor`, after `cfg` is loaded, before `runPreflight`)
**Changes**:
```ts
export async function runDoctor({ cwd, workflow, env }: DoctorOpts): Promise<DoctorResult> {
  const sourceEnv = env ?? process.env;
  let cfg;
  try {
    cfg = await loadConfig(cwd, sourceEnv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      stdout: "",
      stderr: `doctor: could not load config — ${msg}\nRun \`cycle init\` first if this repo is not initialized.`,
      exitCode: 1,
    };
  }

  const available = cfg.workflows.map((w) => w.name);
  const availableList = available.join(", ");

  // workflow === undefined ⇒ no --workflow flag ⇒ default. An explicit value
  // (incl. "") is user-supplied and must validate against the config set.
  let effective: string;
  if (workflow === undefined) {
    effective = "feature";
  } else if (workflow === "") {
    return {
      stdout: "",
      stderr: `doctor: --workflow requires a value — available workflows: ${availableList}`,
      exitCode: 1,
    };
  } else if (!available.includes(workflow)) {
    return {
      stdout: "",
      stderr: `doctor: unknown workflow "${workflow}" — available workflows: ${availableList}`,
      exitCode: 1,
    };
  } else {
    effective = workflow;
  }

  const result = runPreflight({ cfg, workflowName: effective, env: sourceEnv });
  return { stdout: renderReport(result), stderr: "", exitCode: result.ok ? 0 : 1 };
}
```
Update the doc comment to note that an unknown/value-less explicit `--workflow` returns a non-zero validation result before probing, and the no-arg path defaults to `feature`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] `workflow: undefined` defaults to `feature` and probes (no rejection)
- [ ] `workflow: ""` returns `exitCode: 1`, stderr matches `doctor: --workflow requires a value` and lists names
- [ ] `workflow: "no_such_wf"` returns `exitCode: 1`, stderr contains `no_such_wf` and lists names
- [ ] Validation returns before `runPreflight` (no probe spawned on rejection paths)
- [ ] `runDoctor` still never throws; config-load failure path unchanged
- [ ] Available-names list derived from `cfg.workflows` (not hand-coded)

---

## Task 3: Add dispatch/validation tests and extend the fixture

### Overview
Add unit tests calling `runDoctor` directly for the four scenarios, and add a second named workflow to the fixture with a *distinct* agent so "valid explicit name probes that workflow" is observably different from the `feature` default.

### Changes Required
**File**: `tests/cli/doctor.test.ts`
**Changes**:
1. Extend `WORKFLOWS_YML` with a second workflow using a distinct agent (`gemini`) so probing it surfaces a different check than `feature` (codex):
```yaml
  - name: e2e-tests
    max_cycle_attempts: 1
    steps:
      - name: build
        agent: gemini
```
   (Existing `feature` tests are unaffected — they pass `workflow: "feature"`.)
2. New tests:
   - **Unknown name**: `runDoctor({ cwd: root, workflow: "no_such_wf", env: {…CYCLE_CODEX_BIN} })` ⇒ `exitCode !== 0`; `stderr` matches `/no_such_wf/` and `/available workflows:/` and contains `feature` + `e2e-tests`; `stdout === ""`.
   - **Value-less flag**: `runDoctor({ cwd: root, workflow: "", env })` ⇒ `exitCode !== 0`; `stderr` matches `/--workflow requires a value/` and lists names; `stdout` does not contain `all checks passed`.
   - **No-arg default (regression)**: `runDoctor({ cwd: root, env })` (omit `workflow`, i.e. `undefined`) with `CYCLE_CODEX_BIN` fake ⇒ `exitCode === 0`, stdout shows `feature`'s codex check (`/agent\s+codex\s+ok/`).
   - **Valid explicit name probes that workflow**: `runDoctor({ cwd: root, workflow: "e2e-tests", env: {…CYCLE_CODEX_BIN, CYCLE_GEMINI_BIN} })` ⇒ stdout shows a `gemini` check (`/agent\s+gemini\s+ok/`), proving `e2e-tests` resolved rather than the `feature` default.
   - **No-probe / read-only on rejection**: after an unknown-name `runDoctor` call, assert no new files were written under `.cycle/` (mirror the existing read-only test's `readdir` snapshot approach) and that no fake-bin invocation occurred (the unknown-name test passes no valid bin yet still exits non-zero without a probe failure message — assert stderr is the validation message, not a `check(s) failed` report).

### Success Criteria
- [ ] All new tests pass; all existing `tests/cli/doctor.test.ts` tests still pass
- [ ] `npm test` green; `src/cli/doctor.ts` coverage ≥ 70% (report in `BUILD.md`)
- [ ] Tests are hermetic (absolute `CYCLE_<AGENT>_BIN`, explicit `env`); no real agent CLI required
- [ ] Rejection-path test confirms no probe ran and no `.cycle/` state written

---

## Task 4: Documentation updates

### Overview
Reflect the new validation behavior in the docs that describe the `doctor` flag.

### Changes Required
**File**: `CLAUDE.md` (Commands table `cycle doctor` row)
**Changes**: Add a note: an unknown or value-less `--workflow` now exits non-zero and lists the available workflows; the no-arg path still defaults to `feature`.

**File**: `docs/doctor.md` (the `--workflow <name>` section, ~`:12-17`)
**Changes**: Document: an unknown name or a trailing value-less `--workflow` ⇒ non-zero exit with a stderr message listing the available workflows; no `--workflow` ⇒ `feature` default (unchanged); validation runs before any probing (command stays read-only).

**File**: `README.md`
**Changes**: No edit unless README enumerates doctor flag behavior (it does not per RESEARCH) — confirm and skip.

### Success Criteria
- [ ] `CLAUDE.md` and `docs/doctor.md` describe the new behavior
- [ ] Docs match the implemented stderr wording and exit semantics

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Running `cycle doctor --workflow no_such_wf` exits non-zero and prints a stderr message that contains `no_such_wf` and lists the available workflow names (user-observable benefit: the typo is surfaced instead of a false green). | Task 2, Task 3 | Validation + unknown-name test |
| [ ] Running `cycle doctor --workflow` with no following value exits non-zero with the same workflow-validation error, not `doctor: all checks passed`. | Task 1, Task 2, Task 3 | Dispatch maps value-less flag to `""`; runDoctor rejects; value-less test |
| [ ] Running `cycle doctor` and `cycle preflight` with no `--workflow` argument resolves the workflow to `feature` and runs preflight against it (regression guard). | Task 1, Task 2, Task 3 | No-flag ⇒ `undefined` ⇒ `feature`; no-arg default test |
| [ ] Running `cycle doctor --workflow <real-name>` for a workflow present in config probes that workflow (not the `feature` default). | Task 2, Task 3 | `e2e-tests`/`gemini` fixture proves distinct probe |
| [ ] Failure-path: on an unknown or value-less `--workflow`, no agent/tool preflight probe is invoked and no lock or state file is written (validation precedes probing). | Task 2, Task 3 | Validation returns before `runPreflight`; read-only/no-probe test |
| [ ] All existing tests still pass. | Task 3 | `npm test` |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | typecheck in success criteria |

---

## Testing Strategy

### Unit Tests
- Drive `runDoctor` directly (per SPEC) with hermetic absolute `CYCLE_<AGENT>_BIN` fakes and explicit `env`; assert on `exitCode` / `stdout` / `stderr` from the returned `DoctorResult`.
- Edge cases: `workflow: undefined` (no flag → `feature` default), `workflow: ""` (value-less flag → reject), `workflow: "no_such_wf"` (unknown → reject), `workflow: "e2e-tests"` (valid explicit → probes that workflow).
- **Failure-path tests**:
  - Unknown name → non-zero exit, stderr names the bad value + available list, `stdout === ""`, no probe-failure report.
  - Value-less flag → non-zero exit, `--workflow requires a value` message, no silent `feature` pass.
  - Config-load failure path remains covered by the existing unloadable-config test (unchanged).
  - Read-only assertion: no new `.cycle/` files after a rejection (`readdir` snapshot, mirroring the existing read-only test).
- **Mocking strategy**: real `loadConfig`/`runDoctor` against a temp-dir repo fixture; only the agent binaries are faked via absolute `CYCLE_<AGENT>_BIN` paths (the established hermetic pattern). No mocking of `runPreflight` or config internals.

### Integration / E2E Tests
- None required (no UI; SPEC: "No UI change; no E2E tests required"). The `runDoctor`-direct tests already cover dispatch-equivalent behavior; the `doctor ≡ preflight` equivalence is covered by the existing test and unchanged by this cycle.

## Risk Assessment
- **Empty-string-as-signal ambiguity**: a user passing `--workflow ""` is treated as value-less. Acceptable — an empty workflow name is never valid; the error still lists available workflows. Mitigation: documented in the `DoctorOpts.workflow` comment and exercised by the value-less test.
- **Fixture change breaking existing tests**: adding the `e2e-tests`/`gemini` workflow could alter checks for tests that probe `feature`. Mitigation: existing tests pass `workflow: "feature"`, which probes only the triage agent (codex) + feature's codex step + tools — unaffected by the second workflow. Run full suite to confirm.
- **Coverage floor**: the new rejection branches add lines to `doctor.ts`; the four new tests exercise every branch, keeping coverage ≥ 70%. Mitigation: report numbers in `BUILD.md`; add a branch test if the gate flags a gap.
