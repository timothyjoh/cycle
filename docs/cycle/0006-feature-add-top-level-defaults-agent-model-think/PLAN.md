# Implementation Plan: Cycle 0006

## Overview
Add an optional top-level `defaults: { agent, model, thinking }` block to `workflows.yml`, resolved into every workflow `Step` at config-load time inside `loadConfig`, so operators set a run-wide agent/model/thinking once and override per-step, while the rest of the engine keeps reading concrete `step.*` values unchanged.

## Current State (from Research)
- `Step` (`src/engine/workflow.ts:5-13`) already carries a required `agent` union and optional `model`/`thinking`. `CycleConfig` (`:41-45`) has no `defaults` field.
- `loadConfig` (`:47-92`) reads `.cycle/workflows.yml`, performs structural validation throwing `workflows.yml malformed: <reason> (${path})`, normalizes `engine.commit` in-place by mutating `parsed`, then `return parsed as CycleConfig` at `:91`. This in-place-mutate-before-return pattern is the precedent for defaults resolution.
- The per-workflow validation loop at `:68-72` already iterates `parsed.workflows` with access to both `w.name` and `w.steps` — the natural home for step resolution.
- Valid agent set lives in `src/engine/exec.ts`: `REGISTRY` (`:39-46`, keys `auggie, claudecode, codex, gemini, opencode, pi`) is module-private; `resolveAgent`/`UnknownAgentError` are exported. `bash` is NOT in `REGISTRY` (dispatched outside it in `run-cycle.ts:337`).
- bash discrimination is `step.agent === "bash"` (`run-cycle.ts:337,323,371`); `execBashStep` never reads `model`/`thinking`, so resolved values on a bash step are inert.
- `run-cycle.ts:209` calls `loadConfig` once; a throw aborts the cycle before any step runs. `run-cycle.ts:346-347` forwards `step.model`/`step.thinking` unchanged.
- Defaults source `src/defaults/workflows.yml` repeats `agent: claudecode` on every agent step; `.cycle/workflows.yml` is byte-identical. `scripts/sync-defaults.mjs` copies `src/defaults/` → `.cycle/` with a sha256 divergence guard.
- Tests: `tests/engine/workflow.test.ts` holds the `loadConfig` battery (happy path, per-agent parse, malformed rejections via `assert.rejects(…, /substring/)` with temp-dir fixtures). `tests/defaults/feature-loadable.test.ts` asserts resolved per-step `agent` against `src/defaults/workflows.yml`; `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts` assert step-name sequence + count 11.

## Desired End State
- `loadConfig` accepts an optional top-level `defaults` object and resolves `effectiveAgent = step.agent ?? defaults.agent`, `effectiveModel = step.model ?? defaults.model`, `effectiveThinking = step.thinking ?? defaults.thinking` for every step in every workflow, mutating each step in place before the return cast.
- Every returned `Step` carries a concrete `agent`; `model`/`thinking` are set only when a step or default supplies them. bash steps keep `agent: "bash"` and are never coerced.
- A missing agent (no step agent, no default), an unknown resolved agent, or a non-object `defaults` each throw a `workflows.yml malformed: … (${path})` error naming the workflow + step (+ rejected value).
- `src/defaults/workflows.yml` uses `defaults: { agent: claudecode }`, drops redundant per-step `agent: claudecode`, keeps explicit `agent: bash` on `verify`/`final_verify`; `.cycle/workflows.yml` matches byte-for-byte after `npm run sync-defaults`.
- Verify: `npm run typecheck` clean, `npm test` passes, coverage not decreased.

## What We're NOT Doing
- Not forwarding `--model`/thinking into `claudecode`/`gemini`/etc. argv (sibling issue `feat-agent-model-forwarding`). Resolution only populates config values.
- Not documenting which model strings each agent accepts (`docs-supported-models-reference`).
- Not changing `run-cycle.ts` step-execution logic or any `exec-*.ts` provider module.
- Not applying `defaults` to the top-level `triage` block — SPEC scope names only workflow `steps`; `triage.agent` stays as-is.
- Not adding a new structural invariant for agent-fleet consistency — SPEC requires only borrowing the set at runtime.
- Not modifying `document`/`quickfix`/`e2e-tests` step agents beyond dropping redundant `agent: claudecode` where they inherit the default (bash steps keep explicit `agent: bash`).

## Implementation Approach
Borrow the valid-agent set from the registry by exporting a `knownAgents()` accessor (or `REGISTRY_KEYS`) from `exec.ts`, so `workflow.ts` validates against `Object.keys(REGISTRY) ∪ {bash}` without re-hand-coding the union (honoring the CLAUDE.md fleet-consistency caveat). Add a `Defaults` type and `defaults?: Defaults` to `CycleConfig`. In `loadConfig`, after existing structural validation and before the `return parsed as CycleConfig`, validate `defaults` is an object (if present) and run a resolution pass over `parsed.workflows[].steps[]` that fills `step.agent`/`step.model`/`step.thinking` from defaults, then validates each resolved `agent` against the valid set. All failures throw the existing malformed-config error shape. Then rewrite the defaults YAML and re-sync. This keeps every engine downstream of `loadConfig` unchanged.

## Failure & Resilience Decisions

**Task 1 (export valid-agent set from `exec.ts`)** — N/A — pure (in-memory accessor returning registry keys; no I/O).

**Task 2 (`loadConfig` defaults resolution + validation)**
- **Failure modes**: (a) `defaults` present but not an object → throw malformed-config error. (b) a step ends with no agent (no `step.agent`, no `defaults.agent`) → throw naming workflow + step. (c) a resolved agent (from default or step) is not in `knownAgents() ∪ {bash}` → throw naming workflow + step + rejected value. All propagate out of `loadConfig` (and `loadWorkflow`), aborting the cycle at `run-cycle.ts:209` before any step runs. No fallback/retry — config errors are operator-fixable, fail-fast is correct.
- **Idempotency**: `loadConfig` remains a pure read + deterministic, side-effect-free in-memory normalization. It mutates only the freshly-parsed `parsed` object (never the filesystem), so repeated calls (`loadWorkflow` calls it fresh each time) yield identical results. Safe to re-run under engine retry/restart.
- **Observability**: `loadConfig` emits no log events (matching the existing convention — it communicates via return value or thrown `Error`). Diagnosability comes from the thrown message naming workflow, step, and rejected value, plus the preserved `(${path})` suffix.
- **No silent failure**: every error path throws synchronously; no `catch` swallows. The only `try/catch` (file read at `:50-54`) is unchanged and re-throws as a descriptive error.

**Task 3 (rewrite `src/defaults/workflows.yml` + `npm run sync-defaults`)**
- **Failure modes**: post-rewrite, `loadConfig` against the new YAML could throw if resolution is wrong → caught by `feature-loadable`/`feature-yaml` tests, not at runtime. `sync-defaults` may exit 2 (divergence guard) if `.cycle/workflows.yml` was hand-edited and matches neither recorded `dst_sha256` nor current `src_sha256`; resolution is to run with `--force`/`CYCLE_SYNC_DEFAULTS_FORCE=1` only if the runtime copy is intentionally being overwritten.
- **Idempotency**: re-running `sync-defaults` after the source/dest already match is a no-op (sha guard); safe to re-run.
- **Observability**: `sync-defaults` reports copied/skipped files and exit code; the byte-for-byte match is enforced by the dogfood test.
- **No silent failure**: a sync skip surfaces as exit 2; a mismatched `.cycle/workflows.yml` fails `tests/dogfood/feature-yaml.test.ts`.

**Task 4 (tests)** — N/A — pure (test code).

**Task 5 (docs)** — N/A — pure (Markdown edits).

---

## Task 1: Export the valid-agent set from `exec.ts`

### Overview
Expose the registry key set so `workflow.ts` can validate resolved agents without duplicating the union literal.

### Changes Required
**File**: `src/engine/exec.ts`
**Changes**: Add an exported accessor that returns the registry keys, e.g.:
```ts
export function knownAgents(): string[] {
  return Object.keys(REGISTRY);
}
```
Keep `REGISTRY` private; only the key set is exposed. `workflow.ts` will compute the valid set as `new Set([...knownAgents(), "bash"])`.

### Success Criteria
- [ ] Compiles/builds cleanly
- [ ] `npm run typecheck` clean
- [ ] `knownAgents()` returns exactly the six registry keys (`auggie, claudecode, codex, gemini, opencode, pi`)
- [ ] No change to `resolveAgent`/`UnknownAgentError` behavior

---

## Task 2: Add `Defaults` type and resolve defaults in `loadConfig`

### Overview
Introduce the `defaults` config shape and the load-time resolution + agent-validation pass.

### Changes Required
**File**: `src/engine/workflow.ts`

1. Import the accessor: `import { knownAgents } from "./exec.ts";`

2. Add the type and field:
```ts
export type Defaults = {
  agent?: Step["agent"];
  model?: string;
  thinking?: string;
};

export type CycleConfig = {
  engine: EngineConfig;
  triage: TriageConfig;
  workflows: Workflow[];
  defaults?: Defaults;
};
```

3. In `loadConfig`, after the `parsed.workflows` array/per-workflow validation (`:65-72`) and before/around the commit normalization, add a `defaults` validation + resolution block, executed before `return parsed as CycleConfig` (`:91`):
```ts
const rawDefaults = parsed.defaults;
if (rawDefaults !== undefined && (rawDefaults === null || typeof rawDefaults !== "object" || Array.isArray(rawDefaults))) {
  throw new Error(`workflows.yml malformed: defaults must be an object (${path})`);
}
const defaults: Defaults = rawDefaults ?? {};
const validAgents = new Set<string>([...knownAgents(), "bash"]);

for (const w of parsed.workflows) {
  for (const step of w.steps) {
    const agent = step.agent ?? defaults.agent;
    if (!agent) {
      throw new Error(`workflows.yml malformed: workflow "${w.name}" step "${step.name}" has no agent and no defaults.agent (${path})`);
    }
    if (!validAgents.has(agent)) {
      throw new Error(`workflows.yml malformed: workflow "${w.name}" step "${step.name}" has unknown agent "${agent}" (${path})`);
    }
    step.agent = agent;
    if (step.model === undefined && defaults.model !== undefined) step.model = defaults.model;
    if (step.thinking === undefined && defaults.thinking !== undefined) step.thinking = defaults.thinking;
  }
}
```
Notes:
- Resolution uses `??` so an explicit `agent: bash` is never overwritten by `defaults.agent`. bash steps validate (bash ∈ `validAgents`) and keep `agent: "bash"`; their resolved `model`/`thinking` are inert downstream.
- `defaults.agent` itself is validated implicitly: if a step inherits an unknown `defaults.agent`, the per-step `validAgents.has` check throws naming that value. (Every workflow has ≥1 step, so an unknown `defaults.agent` cannot pass unnoticed; no separate standalone-default check needed.)
- `triage` is intentionally not touched.
- The block sits before `return parsed as CycleConfig`, alongside the existing in-place mutation of `parsed.engine.commit`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] A step with no `agent`/`model`/`thinking` inherits all three from `defaults`; setting any one field overrides only that field
- [ ] `agent: bash` step under `defaults.agent: claudecode` stays `bash`
- [ ] Missing-agent, unknown-agent, and non-object-`defaults` each throw the `workflows.yml malformed: … (${path})` shape naming workflow/step (+ rejected value)
- [ ] Configs with no `defaults:` block load identically to before (explicit per-step agents preserved)
- [ ] Failure paths surface errors (no swallowed catch)

---

## Task 3: Rewrite `src/defaults/workflows.yml` and re-sync

### Overview
Adopt the `defaults:` block in shipped defaults; drop redundant `agent: claudecode`; keep explicit `agent: bash`; re-sync the runtime copy.

### Changes Required
**File**: `src/defaults/workflows.yml`
**Changes**: Add a top-level `defaults:` block (place it before `workflows:`, after `triage:`):
```yaml
defaults:
  agent: claudecode
```
Then drop `agent: claudecode` from every inheriting step across all four workflows (`feature`, `document`, `quickfix`, `e2e-tests`), keeping `agent: bash` on the `verify`/`final_verify`/`verify` command steps. Example for `feature`:
```yaml
      - { name: spec,     prompt: prompts/spec.md }
      - { name: research, prompt: prompts/research.md }
      - { name: plan,     prompt: prompts/plan.md }
      - { name: build,    prompt: prompts/build.md }
      - { name: review,   prompt: prompts/review.md }
      - { name: fix,      prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,   agent: bash, command: scripts/verify.sh }
      - { name: reflection,    prompt: prompts/reflection.md }
      - { name: final_fix,     prompt: prompts/final_fix.md, skip_unless: FINAL_FIXES.md }
      - { name: final_verify,  agent: bash, command: scripts/verify.sh }
      - { name: documentation, prompt: prompts/documentation.md }
```
Apply the same drop to `document`, `quickfix`, and `e2e-tests` steps.

**File**: `.cycle/workflows.yml` (generated)
**Changes**: Run `npm run sync-defaults` so it matches `src/defaults/workflows.yml` byte-for-byte. If the divergence guard skips (exit 2), confirm the runtime copy is intentionally regenerated and re-run with `--force` only if appropriate.

### Success Criteria
- [ ] `src/defaults/workflows.yml` has the `defaults:` block; inheriting steps have no `agent:`; bash steps keep `agent: bash`
- [ ] `npm run sync-defaults` completes; `.cycle/workflows.yml` matches source byte-for-byte
- [ ] `tests/defaults/feature-loadable.test.ts` still passes (resolved `steps[0].agent === "claudecode"`, `steps[6].agent === "bash"`, etc.)
- [ ] `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts` (step-name sequence + count 11) pass

---

## Task 4: Tests for resolution, overrides, bash protection, failures, back-compat

### Overview
Add `loadConfig` resolution cases to `tests/engine/workflow.test.ts` following the existing temp-dir/`writeConfig`/`assert.rejects` patterns.

### Changes Required
**File**: `tests/engine/workflow.test.ts`
**Changes**: Add cases:
1. **Happy path / inheritance**: a workflow with `defaults: { agent: codex, model: m1, thinking: high }` and steps that set none of the three; assert each resolved step has `agent === "codex"`, `model === "m1"`, `thinking === "high"`.
2. **Per-field override**: separate steps overriding `agent`, `model`, and `thinking` independently; assert only the overridden field differs and the other two still come from defaults.
3. **bash protection**: a `defaults: { agent: claudecode }` config with an `agent: bash` command step; assert the resolved step keeps `agent === "bash"`. Optionally assert resolved `model`/`thinking` are present-but-inert (they may be set; engine ignores them).
4. **Missing agent**: `assert.rejects(() => loadConfig(root), /workflow "<name>" step "<step>"/)` for a config with no `defaults.agent` and a step with no `agent`.
5. **Unknown `defaults.agent`**: `assert.rejects(…, /unknown agent "nope"/)` for `defaults: { agent: nope }` with agent-less steps.
6. **Unknown `step.agent`**: `assert.rejects(…, /unknown agent "nope"/)` for a step `agent: nope` (with or without defaults).
7. **Non-object `defaults`**: `assert.rejects(…, /defaults must be an object/)` for `defaults: "claudecode"`.
8. **Back-compat**: a fixture with no `defaults:` and explicit `agent` on every step; assert resolved step agents equal the input agents exactly (dedicated test per SPEC acceptance, not relying solely on `feature-loadable.test.ts`).

Use real temp-dir fixtures and `node:assert/strict`; no mocking of `loadConfig` internals.

### Success Criteria
- [ ] All new cases pass under `node --test`
- [ ] Failure-path assertions match thrown messages by substring (workflow, step, rejected value)
- [ ] Back-compat test confirms no-`defaults` configs resolve to identical agents
- [ ] `npm test` passes; coverage does not decrease vs baseline (target full coverage of the new resolution/validation branches in `workflow.ts`)

---

## Task 5: Documentation

### Overview
Document the `defaults:` block and resolution semantics; code without docs is incomplete.

### Changes Required
**File**: `CLAUDE.md` (and `AGENTS.md` if present/mirrored)
**Changes**: Under the workflow/architecture section, add a note: `workflows.yml` supports an optional top-level `defaults: { agent, model, thinking }`; `loadConfig` resolves `step.X ?? defaults.X` per field at load time; bash steps require explicit `agent: bash` and ignore default model/thinking; the valid-agent set is derived from the `exec.ts` REGISTRY keys plus `bash`.

**File**: `README.md`
**Changes**: If `workflows.yml` config is surfaced to users, add a short `defaults:` example. Otherwise, no README change is required (note this decision in `BUILD.md`).

### Success Criteria
- [ ] CLAUDE.md (and AGENTS.md if applicable) documents the `defaults:` block, resolution semantics, bash exception, and registry-derived valid set
- [ ] README updated or its non-applicability recorded

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `workflows.yml` supports an optional top-level `defaults: { agent, model, thinking }`; `loadConfig` returns a `CycleConfig` whose every `Step` has a concrete `agent`. | Task 2 | Type + resolution pass |
| [ ] A step with no `agent`/`model`/`thinking` inherits all three from `defaults`; a step that sets any of those fields overrides only that field (verified per-field). | Task 2, Task 4 | Cases 1–2 |
| [ ] A step declaring `agent: bash` is never reassigned to `defaults.agent`, and the loaded step retains `agent: "bash"` even when `defaults.agent: claudecode` is set. | Task 2, Task 4 | `??` resolution; case 3 |
| [ ] A step with neither `step.agent` nor `defaults.agent` causes `loadConfig` to throw an `Error` whose message names the workflow and the step. | Task 2, Task 4 | Case 4 |
| [ ] An unknown resolved agent (in `defaults.agent` or `step.agent`) causes `loadConfig` to throw an `Error` naming the workflow, step, and rejected agent value. | Task 1, Task 2, Task 4 | Cases 5–6; set from `knownAgents()` |
| [ ] A config with no `defaults:` block and an explicit `agent` on every step loads identically to current behavior (back-compat test asserts resolved steps equal the input agents). | Task 4 | Case 8 |
| [ ] `src/defaults/workflows.yml` uses the new `defaults:` block, command steps keep explicit `agent: bash`, `npm run sync-defaults` has been run, and `.cycle/workflows.yml` matches `src/defaults/workflows.yml` byte-for-byte. | Task 3 | Re-sync + dogfood test |
| [ ] `npm run typecheck` is clean, `npm test` passes, and coverage does not decrease vs the master baseline. | Task 1–4 | Verified at build/verify |

---

## Testing Strategy

### Unit Tests
- Resolution happy path: all three default fields inherited (Task 4 case 1).
- Per-field override independence: `agent`, `model`, `thinking` each overridden alone (case 2).
- bash protection: `agent: bash` under `defaults.agent: claudecode` stays bash; resolved model/thinking inert (case 3).
- Failure paths (one scenario per named failure mode):
  - Missing agent (no step agent, no default) → throws naming workflow + step (case 4).
  - Unknown `defaults.agent` → throws naming rejected value (case 5).
  - Unknown `step.agent` → throws naming rejected value (case 6).
  - Non-object `defaults` (string) → throws `defaults must be an object` (case 7).
- Back-compat: no-`defaults` fixture with explicit per-step agents resolves identically (case 8).
- Mocking strategy: none — use real `loadConfig` against temp-dir `.cycle/workflows.yml` fixtures (`mkdtemp` + `writeConfig`), real YAML parse, assert on return values and thrown `Error` messages by substring. No stubbing of `node:fs` needed (real file writes).

### Integration / E2E Tests
- `tests/defaults/feature-loadable.test.ts` loads the rewritten `src/defaults/workflows.yml` via `loadWorkflow` and asserts resolved per-step agents — exercises real resolution end-to-end against shipped defaults.
- `tests/defaults/feature-yaml.test.ts` + `tests/dogfood/feature-yaml.test.ts` assert step-name sequence/count and that `.cycle/workflows.yml` matches the source post-sync.
- No UI/Playwright tests — config-only change.

## Risk Assessment
- **Standalone unknown `defaults.agent` (no agent-less step inherits it)**: with every workflow having ≥1 step and resolution validating each resolved agent, an unknown `defaults.agent` that is everywhere overridden would not throw — but that is harmless (the default is unused). The SPEC's unknown-default requirement is satisfied wherever a step actually inherits it; accept this as correct, not a gap. Mitigation: none needed; documented here.
- **sync-defaults divergence guard skip (exit 2)**: if `.cycle/workflows.yml` was locally edited, the re-sync may skip. Mitigation: confirm intent and use `--force` only when the runtime copy should be regenerated; the dogfood byte-match test catches a stale copy.
- **Hidden consumers of `step.model`/`step.thinking` being newly-populated on previously-empty steps**: forwarding is out of scope and `run-cycle.ts` already passes these through unchanged, so populating them from defaults only affects argv once forwarding lands. Mitigation: SPEC explicitly defers forwarding; no engine change here.
- **Coverage regression on new branches in `workflow.ts`**: the validation/resolution adds branches. Mitigation: Task 4 cases cover each branch (inherit, override, bash, three error paths, back-compat) to keep global floors intact.
