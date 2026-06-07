# Research: Cycle 0266

## Cycle Context
SPEC.md asks that `cycle doctor` / `cycle preflight` reject an unknown or value-less `--workflow <name>` with a non-zero exit and a stderr message that names the bad value and lists the available workflow names — *before* any agent/tool preflight probing runs — instead of the current behavior where an unknown name silently degrades to a minimal default check set and a trailing value-less `--workflow` silently falls back to `feature`, both producing a false `doctor: all checks passed` (exit 0). The bare no-arg `cycle doctor` / `cycle preflight` path must still default to `feature` byte-for-byte, the command must remain read-only (no lock, no state mutation), and the available-workflows list must be derived from loaded config (`cfg.workflows`), not hand-coded.

## Current Codebase State

### Relevant Components
- **Doctor dispatch (argv parsing)**: parses `--workflow`, defaults to `"feature"`, calls `runDoctor`, writes stdout/stderr, exits with `result.exitCode` — `src/cli.ts:116-124`. The defect is the value resolver: `const workflow = wfIdx >= 0 && rest[wfIdx + 1] ? rest[wfIdx + 1] : "feature";` (`src/cli.ts:120`) — a trailing `--workflow` with no following token (`rest[wfIdx + 1]` falsy) falls back to `"feature"`, and any arbitrary name is forwarded with no existence check.
- **`runDoctor`**: loads config via `loadConfig`, calls `runPreflight({ cfg, workflowName: workflow, env })`, renders the report, returns `{ stdout, stderr, exitCode }` (`DoctorResult`) — `src/cli/doctor.ts:52-67`. It performs **no** workflow-name validation; it passes `workflow` straight into `runPreflight` (`src/cli/doctor.ts:65`).
- **`DoctorResult` / `DoctorOpts` types**: `{ stdout: string; stderr: string; exitCode: number }` and `{ cwd; workflow: string; env? }` — `src/cli/doctor.ts:4-11`. The `workflow` field is a plain `string` (no sentinel for "user gave no value").
- **`renderReport`**: pure view over `PreflightResult` (out of scope to change) — `src/cli/doctor.ts:20-43`.
- **Preflight resolution that silently degrades**: `findWorkflow` returns `undefined` for an unknown name (`src/engine/preflight.ts:120-122`); `distinctAgents` degrades to just the triage agent when the workflow is missing (`src/engine/preflight.ts:128-141`); `detectTools` degrades to `bash`/`git` when the workflow is missing (`src/engine/preflight.ts:147-166`). This is the mechanism producing the false green and must NOT be changed (Out of Scope).
- **Config workflow set (source of valid names)**: `CycleConfig.workflows: Workflow[]` (`src/engine/workflow.ts:88-91`); each `Workflow` has a `name: string` (`src/engine/workflow.ts:25-29`). `findWorkflow` already keys off `w.name === workflowName` (`src/engine/preflight.ts:120-121`). `loadConfig` is the loader (`src/engine/workflow.ts:111+`), already imported in `doctor.ts` (`src/cli/doctor.ts:1`).

### Existing Patterns to Follow
- **DoctorResult contract**: every doctor exit path returns `{ stdout, stderr, exitCode }` — config-load failure uses `stdout:""`, a stderr diagnostic, `exitCode:1` (`src/cli/doctor.ts:57-64`); success uses `exitCode: result.ok ? 0 : 1` (`src/cli/doctor.ts:66`). A new validation-failure path should follow the same shape (stderr message, non-zero exit, no stdout report).
- **Config-load error message style**: lower-cased `doctor: <reason>` prefix plus remediation, e.g. `` `doctor: could not load config — ${msg}\nRun \`cycle init\` first…` `` (`src/cli/doctor.ts:58-62`). A workflow-name error should match this `doctor: …` prefix convention.
- **Available-names-from-config derivation**: read names off `cfg.workflows.map((w) => w.name)` — mirrors how `findWorkflow` and `loadWorkflow` (`src/engine/workflow.ts:196`) already resolve by `w.name`. Do not hand-code the list (SPEC requirement).
- **Dispatch helper-vs-inline**: other CLI dispatch blocks in `src/cli.ts` delegate to a `run*` helper returning `{ stdout, stderr, exitCode }` (e.g. cleanup `src/cli.ts:108-114`, triage). The SPEC permits validation either in the `src/cli.ts` dispatch block or inside `runDoctor`; if moved into `runDoctor`, the dispatch must pass a signal distinguishing "unknown name" / "value-less `--workflow`" from "no `--workflow` given" so the no-arg `feature` default is not itself rejected.
- **Failure handling (today)**: doctor never throws — config-load is wrapped in try/catch returning a result (`src/cli/doctor.ts:55-64`); `runDoctor`'s doc comment states "Never throws" (`src/cli/doctor.ts:50`). `runPreflight` is itself read-only and never throws (per CLAUDE.md preflight notes). Validation must preserve "never throws, returns a result".
- **Read-only invariant**: doctor acquires no lock and mutates no state (`src/cli/doctor.ts:46-51`); validation must fail *before* `runPreflight` probes (which spawn `<bin> --version`). There is no lock-acquire in the doctor path at all — the read-only guarantee is structural, not a flag.
- **Observability**: the doctor/preflight on-demand path emits **no** `.cycle/log.jsonl` events (unlike engine-start preflight in `src/cli.ts`, which renders `engine.preflight.ok`/`failed`); output is purely the rendered report on stdout and diagnostics on stderr. A new validation error should follow suit — stderr only, no log event.
- **Idempotency / retry-safety**: not applicable — the command is a stateless one-shot read; no locks, dedup keys, or guards in this path.

### Dependencies & Integration Points
- `loadConfig(cwd, env)` — `src/engine/workflow.ts:111+`, already invoked inside `runDoctor` (`src/cli/doctor.ts:56`); exposes `cfg.workflows` (the valid-name source).
- `runPreflight` / `PreflightResult` — `src/engine/preflight.ts`, called at `src/cli/doctor.ts:65`; unchanged by this cycle (Out of Scope), but validation must precede it.
- Dispatch entrypoint `src/cli.ts:116-124` — the only caller of `runDoctor` in production; both `doctor` and `preflight` argv heads route here.
- `docs/doctor.md` — documents the flag (`--workflow <name>`, default `feature`) at `docs/doctor.md:12-17`; SPEC requires updating it with the new validation behavior.
- CLAUDE.md Commands table `cycle doctor` row — requires a note about unknown/value-less `--workflow` exiting non-zero.

### Test Infrastructure
- **Test framework**: Node's built-in `node:test` with `node:assert` (`strict`) — `tests/cli/doctor.test.ts:1-2`.
- **Test conventions**: tests live in `tests/cli/doctor.test.ts`; hermetic agent fakes are injected via **absolute** `CYCLE_<AGENT>_BIN` temp-dir paths (never PATH-stubs — `buildChildEnv` prepends node's bin dir and would shadow a stub), each test passes an explicit `env` into `runDoctor` (`tests/cli/doctor.test.ts:10-22`). Repos are built in temp dirs by `makeRepo()` writing a minimal `.cycle/workflows.yml` with a single-agent `feature` workflow + triage (`tests/cli/doctor.test.ts:26-49`). Tests call `runDoctor` directly and assert on `exitCode` / `stdout` / `stderr`.
- **Current coverage of the change area**: existing tests cover clean pass (`tests/cli/doctor.test.ts:51-71`), forced-missing agent (`73-93`), unloadable config (`95-110`), read-only / no new `.cycle/` files (`112-130`), doctor≡preflight equivalence (`132-152`), and `renderReport` branch fixtures (`156-205`). **No test exercises `--workflow` dispatch parsing, unknown-name validation, or the value-less-flag case** — exactly the gap the issue's "Tests" section and REVIEW.md flagged.
- **Failure-path test coverage**: failure cases exist for missing-agent and unloadable-config (`tests/cli/doctor.test.ts:73-110`), but **none** for an unknown/value-less workflow name. The current `makeRepo()` workflow set contains only `feature`, so a test asserting "unknown name rejected" / "valid explicit name probed" may need a second named workflow added to the fixture YAML (or a separate fixture).
- **Coverage floor**: `src/cli/doctor.ts` is pinned at 70% line coverage (CLAUDE.md per-file floors); report numbers in `BUILD.md`.
- **Dispatch testing note**: `src/cli.ts:116-124` is the argv-parsing site. There is no existing unit-level harness that drives the `src/cli.ts` dispatch block directly for doctor; the SPEC's Testing Strategy directs driving validation "at the unit level (calling the dispatch helper or `runDoctor` directly)", which favors implementing the validation as a testable helper or inside `runDoctor` rather than only in the inline dispatch expression.

## Code References
- `src/cli.ts:116-124` — doctor/preflight dispatch; `wfIdx`/value parse at `:120` is the value-less-flag silent-`feature` defect.
- `src/cli/doctor.ts:52-67` — `runDoctor`; passes `workflow` to `runPreflight` (`:65`) with no name validation.
- `src/cli/doctor.ts:4-11` — `DoctorResult` / `DoctorOpts` (`workflow: string`, no "no value given" sentinel).
- `src/cli/doctor.ts:55-64` — config-load try/catch returning a non-zero `DoctorResult` (the error-result pattern to mirror).
- `src/engine/preflight.ts:120-122` — `findWorkflow` returns `undefined` for unknown names.
- `src/engine/preflight.ts:128-141`, `147-166` — `distinctAgents` / `detectTools` silent degrade-to-default for a missing workflow.
- `src/engine/workflow.ts:88-91`, `25-29` — `CycleConfig.workflows: Workflow[]`, `Workflow.name: string` (valid-name source).
- `tests/cli/doctor.test.ts:26-49` — `makeRepo()` fixture (single `feature` workflow) and `WORKFLOWS_YML`.

## Open Questions
- Should validation live in the `src/cli.ts` dispatch block or inside `runDoctor`? The SPEC allows either; if inside `runDoctor`, the dispatch at `src/cli.ts:120` must pass a signal distinguishing "unknown name" / "value-less `--workflow`" from "no `--workflow` given" (e.g. an `undefined`/optional `workflow` field or a separate flag) so the no-arg default still resolves to `feature`. The plan step must choose and define the `DoctorOpts` contract change (if any).
- The current test fixture defines only a `feature` workflow; the planner must decide whether the "valid explicit name probes that workflow" acceptance test adds a second named workflow to `WORKFLOWS_YML` or reuses `feature` as the explicit name.
- Exact stderr message wording/format for the unknown-name error (must contain the bad value and the config-derived available-workflow list) — to be fixed by the plan.
