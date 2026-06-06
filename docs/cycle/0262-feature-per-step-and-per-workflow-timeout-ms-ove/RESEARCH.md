# Research: Cycle 0262

## Cycle Context
SPEC 0262 asks for an optional `timeout_ms` override resolvable at the **step** and **workflow** level, layered over the existing global `engine.step_timeout_ms` default. At runtime each agent step's wall-clock budget must resolve `step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms ?? built-in fallback`, and that resolved value must be threaded into the existing `timeoutMs:` spawn argument and reported as the `step.timeout` event's `limit_ms`. This is purely a config-resolution change — all kill (SIGTERM→SIGKILL child-tree), event (`step.timeout`), salvage (`step.timeout_salvaged`), and `result.timedOut` machinery is reused byte-for-byte unchanged. Malformed/non-positive values at either level are ignored defensively and fall through to the next resolution level. The resolution must mirror the established top-level `defaults` pattern already in `loadConfig`. Out of scope: idle/stall detection, bash-step timeouts, and any change to the kill/event/salvage code.

## Current Codebase State

### Relevant Components
- **`Step` type**: declares `name`, `agent`, `prompt`, `command`, `skip_unless`, `model`, `thinking` — **no `timeout_ms` field today** — `src/engine/workflow.ts:6-14`.
- **`Workflow` type**: declares `name`, `description`, `max_cycle_attempts`, `steps` — **no `timeout_ms` field today** — `src/engine/workflow.ts:20-25`.
- **`EngineConfig.step_timeout_ms`**: the single global per-step wall-clock timeout (optional `number`; `0`/undefined disables) — `src/engine/workflow.ts:33-34`.
- **`loadConfig`**: parses `.cycle/workflows.yml`, validates shape, resolves top-level `defaults` into every step — `src/engine/workflow.ts:84-170`.
- **Agent-step call site (the read to replace)**: `timeoutMs: cfg.engine.step_timeout_ms` is passed directly into `mod.runStep(...)` — `src/engine/run-cycle.ts:660`.
- **`step.timeout` event emission**: `limit_ms: cfg.engine.step_timeout_ms ?? null` — `src/engine/run-cycle.ts:719-721`.
- **`ExecModule.runStep` signature**: accepts `timeoutMs?: number`, forwarded to `runAgent` — `src/engine/exec.ts:21-34` (esp. `:28-29`).
- **Timer arming (the machinery to leave untouched)**: `if (timeoutMs && timeoutMs > 0) { … }` arms the SIGTERM→SIGKILL kill-tree with a 5 s grace — `src/engine/exec-spawn.ts:75-87`.
- **`result.timedOut` marking**: set on the result type when a step is killed by the wall-clock timeout — `src/engine/exec-types.ts:7`.

### Existing Patterns to Follow

- **Top-level `defaults` resolution (the model for this change)**: `loadConfig` reads `parsed.defaults`, validates it is an object (else throws `workflows.yml malformed: defaults must be an object`), then loops every step in every workflow writing `effective X = step.X ?? defaults.X` back onto the concrete `step` so the rest of the engine reads one concrete value: `if (step.model === undefined && defaults.model !== undefined) step.model = defaults.model;` — `src/engine/workflow.ts:140-167` (esp. the per-step loop `:154-166`). Note this pattern is **two-level** (step → defaults); the new resolution is **three-level** (step → workflow → engine).

- **Defensive read-site coercion of numeric configs (the model for malformed-value handling)**: numeric engine configs are coerced at their read site, not at load time, and ignored when invalid. Canonical instances:
  - `max_rate_limit_retries`: `typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 24` — `src/engine/run-cycle.ts:643-645`.
  - `walkthrough_hook_timeout_ms`: defensively coerced at the run-cycle read site; `0`/negative/non-integer/`NaN`/`Infinity`/non-number/absent ⇒ disabled (no timer armed) — `src/engine/run-cycle.ts:513` and documented at `docs/ENGINE.md:275`.
  - `rate_limit_backoff_ms`: `cfg.engine.rate_limit_backoff_ms ?? 3_600_000` — `src/engine/run-cycle.ts:707`.
  The SPEC's "ignored defensively at the read site … never arm a zero/negative timer" requirement matches this convention exactly. Note the existing `step_timeout_ms` itself is **not** currently coerced — it is read raw at `run-cycle.ts:660` and the only guard is `timeoutMs && timeoutMs > 0` in `exec-spawn.ts:75`.

- **`workflows.yml malformed: …` validation errors**: `loadConfig` throws `Error(\`workflows.yml malformed: … (${path})\`)` naming the offending workflow/step for shape violations — `src/engine/workflow.ts:96-167` (e.g. `:165` unknown-agent, `:146` non-object defaults). The SPEC requires malformed `timeout_ms` to be **ignored** (fall through), not throw — diverging from the unknown-agent throw behavior and aligning instead with the numeric read-site coercion pattern above.

- **Failure handling (timeout path) today**: a step whose subprocess exceeds `timeoutMs` is SIGTERM-killed (then SIGKILL after 5 s), the result is marked `timedOut: true` (`exec-spawn.ts:80-85`), `run-cycle` emits `step.timeout { cycle_id, step, limit_ms }` (`run-cycle.ts:719-721`), and the killed step routes through the normal fatal step-failure / completion-proof path. If the artifact is complete despite the kill, `step.timeout_salvaged` is emitted and the step is accepted — `run-cycle.ts:764-769`. The completion-proof message branches on `r.timedOut` (`formatTimeoutProofError` vs `formatCompletionProofError`) — `run-cycle.ts:747-764`, documented `docs/ENGINE.md:163-168`.

- **Observability conventions**: structured JSONL events to `.cycle/log.jsonl` via `log.emit("<event>", { … })`. The relevant event is `step.timeout { cycle_id, step, limit_ms }` — `run-cycle.ts:720`. The SPEC requires the event **shape unchanged**; only the `limit_ms` *value* changes from the global to the resolved per-step value.

- **Idempotency / retry-safety**: not directly implicated — this is a pure config-resolution change. The resolved timeout participates in the existing per-step retry loop (rate-limit retries, `max_cycle_attempts`) without new state. The timer is `unref()`-ed so it never blocks process exit (`exec-spawn.ts:86`).

### Dependencies & Integration Points
- **`yaml`** (`YAML.parse`) — parses `workflows.yml` — `src/engine/workflow.ts:3,93`.
- **`knownAgents()`** from `exec.ts` — used by `loadConfig` to derive the valid-agent set — `src/engine/workflow.ts:4,149`.
- **`resolveAgent(step.agent).runStep(...)`** — the agent-step dispatch that receives `timeoutMs` — `src/engine/run-cycle.ts:652-662`.
- **`runAgent` / `exec-spawn.ts`** — the single consumer of `timeoutMs` that arms the kill timer — `src/engine/exec-spawn.ts:23,75`.
- **`loadWorkflow`** — thin wrapper over `loadConfig` returning a single workflow by name — `src/engine/workflow.ts:172-177` (would carry a new `Workflow.timeout_ms` field transparently if resolution is load-time on steps).
- **`src/defaults/workflows.yml`** — shipped default config (synced to `.cycle/` via `npm run sync-defaults`); no `timeout_ms` keys today. A doc/config bullet update may need a sync per CLAUDE.md "After editing `src/defaults/`, run `npm run sync-defaults`."

### Test Infrastructure
- **Test framework**: Node built-in test runner (`node:test`, `node:assert`/`node:assert/strict`); `npm test` (auto-builds via `pretest`) and `npm run test:coverage` (LCOV + per-file floors via `scripts/coverage-gate.mjs`).
- **`loadConfig` / defaults resolution tests**: `tests/engine/workflow-defaults.test.ts` — uses `mkdtemp` temp repos, writes a `.cycle/workflows.yml` body, calls `loadConfig(root)`, asserts resolved `step.agent`/`step.model`/`step.thinking` (`:25-48`, `:50+`). This is the direct model for resolution-precedence tests. `tests/engine/workflow.test.ts` covers base `loadConfig` validation.
- **Timeout behavior tests (the machinery being reused)**:
  - `tests/engine/exec-spawn.test.ts:108-156` — `runAgent timeout` kills a hung child (`timeoutMs: 300` ⇒ `r.timedOut === true`) and a fast child is **not** marked timed out (`timeoutMs: 5_000` ⇒ `r.timedOut === undefined`). Failure-path coverage exists at the spawn layer.
  - `tests/engine/run-cycle.completion-proof.test.ts` — `workflowYml(steps, stepTimeoutMs?)` helper emits `step_timeout_ms: <n>` into the engine block (`:25-47`); `setupRepo(..., stepTimeoutMs?)` (`:49-69`); a 200 ms `step_timeout_ms` test drives the SIGTERM-killed `r.timedOut === true` path and the `step.timeout_salvaged` accept path (`:254`, `:300-335`). This is the model for an end-to-end "short `timeout_ms` ⇒ observable timeout" test; the helper currently only injects an **engine-level** `step_timeout_ms`, so it would need extension to emit step/workflow-level `timeout_ms`.
- **Test conventions**: temp git repos via `mkdtemp` + `git init -b main`; fake agent binaries written to a temp bin dir and resolved via `CYCLE_<AGENT>_BIN` (e.g. fake `claude` at `:65-67`); exactly-once events asserted with `filter(...).length === 1` (CLAUDE.md) and `expectExactlyOne` from `tests/helpers.ts`.
- **Coverage floors**: `src/engine/run-cycle.ts` ≥ 90%, `src/engine/queue.ts` ≥ 90% (CLAUDE.md). `workflow.ts` has no dedicated per-file floor listed but is covered by the global Line ≥ 95% / Branch ≥ 75% / Function ≥ 90% policy; new branches in `loadConfig` and the run-cycle read site must carry tests in-cycle.
- **Failure-path test coverage for the change area**: present — both the spawn-layer timeout kill (`exec-spawn.test.ts`) and the run-cycle timeout/salvage routing (`run-cycle.completion-proof.test.ts`) have failure-path tests. No existing test exercises a **per-step or per-workflow** `timeout_ms` (the field does not exist yet).

## Code References
- `src/engine/workflow.ts:6-14` — `Step` type (add `timeout_ms?: number`).
- `src/engine/workflow.ts:20-25` — `Workflow` type (add `timeout_ms?: number`).
- `src/engine/workflow.ts:33-34` — `EngineConfig.step_timeout_ms` (the engine-level default in the resolution chain).
- `src/engine/workflow.ts:154-166` — the per-step `defaults` resolution loop in `loadConfig` (the pattern to mirror; the natural site for load-time step→workflow→engine resolution).
- `src/engine/run-cycle.ts:643-645` — `max_rate_limit_retries` defensive read-site coercion (the model for malformed/non-positive coercion).
- `src/engine/run-cycle.ts:660` — `timeoutMs: cfg.engine.step_timeout_ms` agent-step call site (the read to replace with the resolved value).
- `src/engine/run-cycle.ts:719-721` — `step.timeout` emission with `limit_ms: cfg.engine.step_timeout_ms ?? null` (use the resolved value for `limit_ms`; shape unchanged).
- `src/engine/exec.ts:21-34` — `ExecModule.runStep` `timeoutMs?` parameter (unchanged interface; receives the resolved value).
- `src/engine/exec-spawn.ts:75-87` — `if (timeoutMs && timeoutMs > 0)` timer arming + SIGTERM→SIGKILL kill-tree (out of scope; must stay byte-for-byte).
- `src/engine/exec-types.ts:7` — `timedOut` marking on the result (out of scope).
- `docs/ENGINE.md:163-168` — completion-proof message branching on `r.timedOut`; references the `step.timeout` limit (doc section adjacent to where the timeout-resolution note belongs).
- `tests/engine/workflow-defaults.test.ts:25-48` — resolution-precedence test model.
- `tests/engine/run-cycle.completion-proof.test.ts:25-69`, `:254`, `:300-335` — end-to-end timeout-kill / salvage test model and the `step_timeout_ms`-injecting helpers.
- `CLAUDE.md:125` — the `engine.walkthrough_hook_timeout_ms` config bullet (style model for the new `timeout_ms` config bullet to add).

## Open Questions
- **Where the three-level resolution lands.** The SPEC says resolve "at config-load time consistent with the top-level `defaults` resolution already in `loadConfig`" (which writes onto `step`), but also says malformed/non-positive values are "ignored defensively **at the read site**." The existing `defaults` resolution is in `loadConfig` (`workflow.ts:154-166`) while every numeric coercion (`max_rate_limit_retries`, `walkthrough_hook_timeout_ms`) is at the `run-cycle.ts` read site. The planner must decide whether to (a) resolve+coerce in `loadConfig`, writing an effective `step.timeout_ms`, or (b) leave the raw fields on `Step`/`Workflow` and resolve+coerce in `run-cycle.ts` at the `:660`/`:720` read sites, or (c) split (resolve order in `loadConfig`, coerce at read site). The current `engine.step_timeout_ms` is read raw with the only guard being `exec-spawn.ts:75`'s `timeoutMs > 0`.
- **Built-in fallback value.** The resolution chain ends in "built-in fallback," but `engine.step_timeout_ms` is `optional` with no hard-coded default constant in `workflow.ts`/`run-cycle.ts` today (absent ⇒ `undefined` ⇒ no timer armed via the `exec-spawn.ts:75` guard). The planner must confirm whether the "built-in fallback" means a concrete numeric default (and its value) or the existing "no timer when fully absent" behavior.
- **Defaults file / sync.** Whether `src/defaults/workflows.yml` should ship an example `timeout_ms` (requiring `npm run sync-defaults`) or stay untouched, per the "Configs with no `timeout_ms` anywhere behave exactly as before" guarantee.
- **Structural invariant.** Whether adding `timeout_ms` to the `Step`/`Workflow` union needs a corresponding entry in `scripts/structural-invariants.mjs` (no existing invariant covers `Step` optional fields like `model`/`thinking`, so likely none required — to be confirmed by the planner).
