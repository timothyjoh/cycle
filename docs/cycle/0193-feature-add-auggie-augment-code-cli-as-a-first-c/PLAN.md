I have all the context needed. Writing the PLAN.md now.

`★ Insight ─────────────────────────────────────`
exec-auggie.ts will be an exact mirror of exec-codex.ts — only the binary name changes. The open question about auggie flag names is handled by SPEC directive: emit a TODO comment in code, don't block the cycle.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0193

## Overview
Add `auggie` (Augment Code CLI) as a first-class agent in the cycle engine by creating `exec-auggie.ts`, registering it in the REGISTRY, widening `Step.agent` to include both `"auggie"` and `"gemini"` (pre-existing gap), and writing tests that mirror the exec-codex test suite.

## Current State (from Research)

- `exec-codex.ts` is the direct template: 11 lines, builds `--model`/`--thinking` argv, calls `runAgent` with `promptDelivery: "stdin"`.
- `REGISTRY` in `exec.ts:24–28` has `claudecode`, `codex`, `gemini` — needs `auggie`.
- `Step.agent` in `workflow.ts:7` is `"claudecode" | "bash" | "codex"` — missing both `"gemini"` (registered in REGISTRY but absent from the type) and `"auggie"` (new).
- `tests/engine/exec-codex.test.ts` is the test template: 6 tests covering stdin roundtrip, non-zero exit, `--model`, `--thinking`, combined flags, ENOENT.
- `ExecModule` interface already carries `model?` and `thinking?` (landed in cycle 0192).

## Desired End State

- `src/engine/exec-auggie.ts` exists, implements `ExecModule`, forwards `--model`/`--thinking` when set.
- `auggie` in REGISTRY; `"auggie"` and `"gemini"` in `Step.agent` union.
- `tests/engine/exec-auggie.test.ts` passes (6 tests mirroring exec-codex suite).
- `workflow.test.ts` has one test confirming `loadConfig` accepts `agent: "auggie"`.
- `npm run typecheck` clean, `npm test` green, coverage gates met.
- CLAUDE.md and ARCHITECTURE.md updated to mention auggie.

## What We're NOT Doing

- Verifying auggie flag names against a live binary — flagged via TODO comment per SPEC.
- Adding `model`/`thinking` forwarding to gemini's exec module.
- Any changes to workflow prompt files or registry lookup logic.
- README.md changes (workflow-author concern, not end-user CLI).

## Implementation Approach

Three code changes (new file, one-line REGISTRY entry, two-token type union extension) plus mirrored tests. Documentation updates last, after tests green.

---

## Task 1: Create `src/engine/exec-auggie.ts`

### Overview
New ExecModule that calls `auggie` via `runAgent` with `promptDelivery: "stdin"`, forwarding `--model` and `--thinking` when present. Exact structural copy of `exec-codex.ts` with binary name changed.

### Changes Required
**File**: `src/engine/exec-auggie.ts` (new)

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: auggie flag names (--model, --thinking) are assumed from codex parity;
// verify against `auggie --help` once auggie CLI stabilizes.
export const auggieExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "auggie", argv, promptDelivery: "stdin", ...args });
  },
};
```

### Success Criteria
- [ ] File compiles with `npm run typecheck` — no errors, no warnings
- [ ] `auggieExec` satisfies `ExecModule` interface

---

## Task 2: Register `auggie` in REGISTRY (`src/engine/exec.ts`)

### Overview
Add import of `auggieExec` and add it to the REGISTRY map.

### Changes Required
**File**: `src/engine/exec.ts`

Add import at line 4 (after existing imports):
```typescript
import { auggieExec } from "./exec-auggie.ts";
```

Extend REGISTRY at line 24–28:
```typescript
const REGISTRY: Record<string, ExecModule> = {
  claudecode: claudecodeExec,
  codex: codexExec,
  gemini: geminiExec,
  auggie: auggieExec,
};
```

### Success Criteria
- [ ] `resolveAgent("auggie")` returns `auggieExec` without throwing
- [ ] `resolveAgent("codex")`, `resolveAgent("gemini")`, `resolveAgent("claudecode")` still resolve correctly

---

## Task 3: Widen `Step.agent` union in `src/engine/workflow.ts`

### Overview
Fix the pre-existing `"gemini"` type gap and add `"auggie"`. Single-token change on line 7.

### Changes Required
**File**: `src/engine/workflow.ts`, line 7

Before:
```typescript
  agent: "claudecode" | "bash" | "codex";
```

After:
```typescript
  agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie";
```

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] A workflow YAML step with `agent: auggie` or `agent: gemini` no longer produces a type error

---

## Task 4: Unit tests — `tests/engine/exec-auggie.test.ts`

### Overview
Six tests mirroring `exec-codex.test.ts` exactly, substituting `"auggie"` for `"codex"` and the binary name. Uses fake shell scripts in a temp bin dir.

### Changes Required
**File**: `tests/engine/exec-auggie.test.ts` (new)

Tests:
1. `auggie: pipes prompt body to stdin, returns stdout` — fake binary `cat`s stdin, assert stdout matches body
2. `auggie: non-zero exit surfaces status:failed and captures stderr` — fake exits 1, assert `status: "failed"`
3. `auggie: --model flag in argv when model is set` — fake echoes `$@`, assert `--model` and value in stdout
4. `auggie: --thinking flag in argv when thinking is set` — fake echoes `$@`, assert `--thinking` and value
5. `auggie: both --model and --thinking flags, model before thinking` — assert order with index comparison
6. `auggie: resolves StepResult{status:failed,exitCode:-1} when auggie binary missing (spawn ENOENT)` — `PATH: "/nonexistent"`, assert `exitCode: -1`

All tests use `resolveAgent("auggie").runStep(...)` so Task 2 is a prerequisite.

### Success Criteria
- [ ] All 6 tests pass
- [ ] No flags appear in argv when neither `model` nor `thinking` is set (verified by test 1 via stdin roundtrip)
- [ ] Tests are structurally identical to exec-codex suite (reviewers can diff them)

---

## Task 5: Workflow parsing test for `agent: "auggie"` in `tests/engine/workflow.test.ts`

### Overview
One new test confirming `loadConfig` accepts a step with `agent: "auggie"` without throwing. Mirrors the codex step test added in cycle 0192.

### Changes Required
**File**: `tests/engine/workflow.test.ts` — append one test:

```typescript
test("parses a workflow step with agent: auggie", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: impl
        agent: auggie
        prompt: prompts/impl.md
`);
    const cfg = await loadConfig(root);
    const step = cfg.workflows[0].steps[0];
    assert.equal(step.agent, "auggie");
    assert.equal(step.prompt, "prompts/impl.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test passes — `loadConfig` returns parsed step without error
- [ ] `step.agent === "auggie"` asserted

---

## Task 6: Documentation updates

### Overview
Update CLAUDE.md and ARCHITECTURE.md to reflect auggie's first-class status. Code without updated docs is incomplete per SPEC.

### Changes Required

**File**: `CLAUDE.md` — update registered step agents line:

Before:
> Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`. `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.

After:
> Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.

**File**: `docs/ARCHITECTURE.md` — locate the agent registry table and add `auggie` row alongside `codex` and `gemini`. Exact location to be found by inspection; add: `auggie | exec-auggie.ts | stdin | optional --model, --thinking`.

### Success Criteria
- [ ] CLAUDE.md registered-agents line includes `auggie`
- [ ] ARCHITECTURE.md agent table includes `auggie` row
- [ ] No other documentation files require changes

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-auggie.ts` exists and implements `ExecModule` | Task 1 | |
| `[ ] auggie` registered in `REGISTRY` in `src/engine/exec.ts` | Task 2 | |
| `[ ] Step.agent` includes `"auggie"` and `"gemini"` (corrects pre-existing type gap) | Task 3 | |
| `[ ] --model <value>` forwarded when `model` is set on an auggie step | Task 4 (test 3) | Also verified structurally in Task 1 |
| `[ ] --thinking <value>` forwarded when `thinking` is set on an auggie step | Task 4 (test 4) | Also verified structurally in Task 1 |
| `[ ] Neither flag appears in argv when the fields are absent | Task 4 (test 1) | Verified via stdin roundtrip — no extra argv tokens in stdout |
| `[ ] Unit test: loadConfig` accepts a step with `agent: "auggie"` without throwing | Task 5 | |
| `[ ] All existing tests still pass` | Tasks 1–6 | No deletions or behavioral changes to existing code |
| `[ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)` | Task 4 | 6 new tests cover all branches in exec-auggie.ts |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean)` | Tasks 1–3 | Verified after each task |

---

## Testing Strategy

### Unit Tests
- `tests/engine/exec-auggie.test.ts` — 6 tests (all branches in exec-auggie.ts; stdin, exit codes, flag forwarding, ENOENT)
- `tests/engine/workflow.test.ts` — 1 new test (`loadConfig` accepts `agent: "auggie"`)
- No mocking: fake shell scripts in temp dirs, same pattern as existing suite
- ENOENT test uses `PATH: "/nonexistent"` to guarantee spawn failure without mocking

### Integration / E2E Tests
- `npm test` full suite after all tasks — must show ≥ 541 tests passing (535 existing + 7 new)
- `npm run test:coverage` — verify Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%

## Risk Assessment
- **Auggie flag names unconfirmed**: Mitigated by TODO comment in exec-auggie.ts per SPEC directive; tests use fake binaries so flag names don't affect CI.
- **Per-file coverage floor for exec-auggie.ts**: No floor currently registered; 6 tests cover all branches — full coverage guaranteed. Add floor to `scripts/coverage-gate.mjs` if the invariants script requires it.
- **`"gemini"` type gap fix**: Additive — no existing code breaks; gemini was already in REGISTRY so runtime behavior is unchanged.
```
