# Research: Cycle 0006

## Cycle Context
This cycle adds an optional top-level `defaults:` block (`agent`, `model`, `thinking`) to `workflows.yml`, resolved into every `Step` at config-load time inside `loadConfig` so that `step.agent ?? defaults.agent` (and the same for `model`/`thinking`) is computed once and the rest of the engine continues to read concrete `step.*` values unchanged. The work touches the type definitions and load logic in `src/engine/workflow.ts`, borrows the valid-agent set from the `REGISTRY` in `src/engine/exec.ts`, rewrites `src/defaults/workflows.yml` to use a `defaults: { agent: claudecode }` block (dropping redundant per-step `agent: claudecode` while keeping explicit `agent: bash`), re-syncs `.cycle/workflows.yml` via `npm run sync-defaults`, and adds unit tests. Agent/model forwarding to the CLIs is explicitly out of scope.

## Current Codebase State

### Relevant Components
- `Step` type (union `agent` field, optional `model`/`thinking`): `src/engine/workflow.ts:5-13`
- `CycleConfig` type (`engine`, `triage`, `workflows`; no `defaults` field today): `src/engine/workflow.ts:41-45`
- `loadConfig` (reads `.cycle/workflows.yml`, validates structure, normalizes `engine.commit`, returns parsed object cast to `CycleConfig`): `src/engine/workflow.ts:47-92`
- `loadWorkflow` (calls `loadConfig`, finds workflow by name): `src/engine/workflow.ts:94-99`
- Agent registry `REGISTRY` and `resolveAgent` / `UnknownAgentError`: `src/engine/exec.ts:31-52`
- Step execution consuming `step.agent`/`step.model`/`step.thinking`: `src/engine/run-cycle.ts:312-357`
- Shipped defaults source: `src/defaults/workflows.yml:1-61`
- Synced runtime copy: `.cycle/workflows.yml:1-61` (currently byte-identical to source)

### Existing Patterns to Follow
- **Malformed-config error style**: every validation failure throws `new Error("workflows.yml malformed: <reason> (${path})")`, including the trailing `(${path})` suffix. Examples: not-an-object `src/engine/workflow.ts:56-58`; missing engine `:59-61`; missing triage `:62-64`; workflows-not-array `:65-67`; workflow entry missing name/steps `:68-72`; `engine.commit.mode` invalid `:80-84` (this one interpolates the rejected value `got "${mode}"`, the closest precedent for naming a rejected agent value).
- **Load-time normalization precedent**: `engine.commit` is resolved/defaulted inside `loadConfig` (`src/engine/workflow.ts:73-90`) by mutating `parsed.engine.commit` before the final `return parsed as CycleConfig`. The new defaults-resolution should follow this in-place mutation pattern (mutate each `step` on `parsed.workflows`) before the cast/return at `:91`.
- **Per-step `model`/`thinking` already supported**: the `Step` type carries optional `model`/`thinking` (`src/engine/workflow.ts:11-12`); `run-cycle.ts` forwards them via `mod.runStep({ ..., model: step.model, thinking: step.thinking })` at `src/engine/run-cycle.ts:346-347`. No engine change is needed if resolution populates these fields at load time.
- **bash-step discrimination is by `step.agent === "bash"`**: `run-cycle.ts` branches on this exact comparison at `src/engine/run-cycle.ts:337` (`execBashStep`), `:323` (`appendSP` suppression), and `:371` (artifact write). `execBashStep` is called with `(repoRoot, step.command!, cycleEnv)` only — it does not read `model`/`thinking`, so resolved values on a bash step are inert. Any default-resolution must NOT set `agent: "bash"` from a default; bash must remain explicit.
- **Agent validation reuse**: `resolveAgent(name)` (`src/engine/exec.ts:48-52`) throws `UnknownAgentError` for unknown names; the valid set is `Object.keys(REGISTRY)` (`auggie, claudecode, codex, gemini, opencode, pi`) — `bash` is NOT in `REGISTRY` (dispatched outside it, `src/engine/run-cycle.ts:337`). The SPEC requires deriving the valid agent set from `REGISTRY` keys ∪ `{bash}` rather than re-hand-coding the `Step["agent"]` union (CLAUDE.md fleet-consistency caveat).
- **Failure handling (config load)**: load failures are surfaced by throwing synchronously inside the async `loadConfig`; no partial config is returned and no state is mutated on the caller side. `loadWorkflow` (`:94-99`) propagates the throw. `run-cycle.ts` calls `loadConfig` once at `src/engine/run-cycle.ts:209` — a throw aborts the cycle before any step runs.
- **Unknown-agent runtime fallback** (separate from load-time validation): at `src/engine/run-cycle.ts:341-356`, a `resolveAgent` throw of `UnknownAgentError` is caught and converted to a failed `StepResult`; other errors re-throw. This is the runtime path; the new load-time validation is additive and fires earlier.
- **Observability**: the engine emits structured JSON events via `log.emit(event, payload)` to `.cycle/log.jsonl` (e.g. `step.start { cycle_id, step, agent }` at `src/engine/run-cycle.ts:312-317`). `loadConfig` itself emits no events and logs nothing — it communicates purely via return value or thrown `Error`. No metric/log convention applies to the config-load path; matching it means raising `Error`s, not emitting events.
- **Idempotency / retry-safety**: `loadConfig` is a pure read of the YAML file (plus deterministic normalization); it has no locks or dedup keys and is safe to call repeatedly (`loadWorkflow` calls it fresh each time, `:95`). Resolution must be deterministic and side-effect-free on the filesystem.
- **YAML inline-map step style**: `src/defaults/workflows.yml` uses flow-mapping step entries `- { name: spec, agent: claudecode, prompt: prompts/spec.md }` (`src/defaults/workflows.yml:21-31`), aligned in columns. The rewrite drops `agent: claudecode` from inheriting steps while keeping `agent: bash` on `verify`/`final_verify` (`:27,:30`) and adds a top-level `defaults:` block (issue example: `docs/cycle/issues/todo/feat-workflow-defaults-agent-model.md:24-37`).

### Dependencies & Integration Points
- `yaml` package — `YAML.parse(body)` parses the config: `src/engine/workflow.ts:3,55`
- `src/engine/exec.ts` `REGISTRY` — source of the valid agent set to borrow: `src/engine/exec.ts:39-46`
- `src/engine/run-cycle.ts` — downstream consumer of resolved `step.agent`/`model`/`thinking`; must remain unchanged per SPEC: `src/engine/run-cycle.ts:209,337-347`
- `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/` with a sha256 divergence guard recorded in `.cycle/.sync-state.json`; a destination whose sha matches neither recorded `dst_sha256` nor current `src_sha256` is skipped (exit 2) unless `--force`/`CYCLE_SYNC_DEFAULTS_FORCE=1`: `scripts/sync-defaults.mjs:21-22,100-134`. After editing `src/defaults/workflows.yml`, this must be run so `.cycle/workflows.yml` matches.
- `npm run sync-defaults` → `node scripts/sync-defaults.mjs` (per CLAUDE.md commands table).

### Test Infrastructure
- **Framework**: `node --test` with `--experimental-strip-types` (no transpile); assertions via `node:assert/strict`.
- **Conventions**: temp-dir fixtures via `mkdtemp(join(tmpdir(), "cycle-test-"))`, `writeConfig(root, body)` writes `.cycle/workflows.yml`, `try/finally` with `rm(root, { recursive: true, force: true })`. Error assertions use `assert.rejects(() => loadConfig(root), /substring/)`. See `tests/engine/workflow.test.ts:17-50`.
- **`loadConfig`/`loadWorkflow` tests** (the change area): `tests/engine/workflow.test.ts` — covers happy-path parse (`:22-50`), multi-workflow selection (`:52-83`), engine/triage exposure (`:85-114`), and a full battery of malformed-config rejections (`:116-200`), commit-mode handling (`:202-282,302-366,456-487`), unknown workflow (`:284-300`), and per-agent parse tests for `codex`+model/thinking (`:368-391`), `auggie` (`:393-412`), `opencode` (`:414-433`), `pi` (`:435-454`). New defaults-resolution cases belong here.
- **Defaults-file structural tests**: `tests/defaults/feature-yaml.test.ts` (asserts feature step-name sequence + count 11 against `src/defaults/workflows.yml`), `tests/defaults/feature-loadable.test.ts` (loads `src/defaults/workflows.yml` via `loadWorkflow` and asserts resolved `agent` per index — `steps[0].agent === "claudecode"`, `steps[6].agent === "bash"`, etc., `:13-24`), and the dogfood mirror `tests/dogfood/feature-yaml.test.ts` (asserts against `.cycle/workflows.yml`). These assert resolved agents and will exercise the new resolution against the rewritten defaults.
- **sync-defaults tests**: `tests/defaults/sync-defaults-guard.test.ts` and `tests/defaults/local-workflows-divergence.test.ts` cover the divergence guard and skip/force behavior.
- **Failure-path coverage today**: extensive — `tests/engine/workflow.test.ts:116-200,256-282` assert thrown-`Error` messages by regex for every existing malformed-config branch. This is the established pattern for the new missing-agent / unknown-agent / non-object-defaults error tests.
- **Coverage floor**: `src/engine/workflow.ts` is not in the per-file `FLOORS` table (CLAUDE.md coverage policy), but global floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) and must not decrease; enforced by `scripts/coverage-gate.mjs`.

## Code References
- `src/engine/workflow.ts:5-13` — `Step` type; `agent` is a required union (no `bash`-vs-agent discriminator beyond the literal), `model`/`thinking` optional.
- `src/engine/workflow.ts:41-45` — `CycleConfig`; the place to add an optional `defaults?: Defaults` field.
- `src/engine/workflow.ts:47-92` — `loadConfig`; structural validation `:56-72`, commit normalization `:73-90`, final `return parsed as CycleConfig` `:91` (the insertion point for defaults resolution + agent validation, before the return).
- `src/engine/workflow.ts:68-72` — per-workflow validation loop (`w.name`, `w.steps`); a natural place to also iterate `w.steps` for resolution, with access to both workflow name and step for error messages.
- `src/engine/exec.ts:39-46` — `REGISTRY` literal; `Object.keys(REGISTRY)` is the agent set to borrow.
- `src/engine/run-cycle.ts:337-347` — bash dispatch vs `resolveAgent(step.agent).runStep({ model: step.model, thinking: step.thinking })`; demonstrates that resolved fields flow through unchanged and that bash never reads model/thinking.
- `src/defaults/workflows.yml:16-61` — the four workflows whose steps must be rewritten to inherit `defaults.agent: claudecode` (keeping explicit `agent: bash` on `verify`/`final_verify`).
- `.cycle/workflows.yml:1-61` — synced copy that must match `src/defaults/workflows.yml` after `npm run sync-defaults`.
- `docs/cycle/issues/todo/feat-workflow-defaults-agent-model.md:39-75` — resolution semantics and implementation notes (`Defaults = { agent?: Step["agent"]; model?: string; thinking?: string }`; resolve at load time).

## Open Questions
- Exact wording and regex-targetable substrings for the three new error messages (missing-agent, unknown-agent, non-object `defaults`) — must preserve the `workflows.yml malformed: … (${path})` shape and name the workflow + step (+ rejected value), but the precise phrasing is a planning/build decision.
- Whether `defaults` resolution should also apply to the top-level `triage` block (which has its own `agent` field at `src/engine/workflow.ts:35-39` / `.cycle/workflows.yml:11-14`); SPEC scope names only workflow `steps`, so triage is presumed untouched — confirm during planning.
- Whether the existing structural tests in `tests/defaults/feature-loadable.test.ts` (which assert resolved per-step `agent`) are sufficient as the post-rewrite back-compat/regression guard, or whether a dedicated no-`defaults` back-compat fixture test should be added per the SPEC's explicit acceptance criterion.
- Whether the agent-fleet structural invariant (noted as not-yet-covered in CLAUDE.md) should be extended here or left as-is; SPEC requires only borrowing the set at runtime, not adding an invariant.
