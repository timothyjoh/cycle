All context gathered. Open questions resolved:
1. TODO comment pattern (same as auggie) — sufficient
2. "Alternative for build / fix / review" for opencode description — consistent with codex/auggie
3. `resolveAgent` indirection is intentional — tests registration AND exec module

```markdown
# Implementation Plan: Cycle 0194

## Overview
Add `opencode` as a first-class workflow step agent, following the identical pattern used for `codex` (cycle 0192) and `auggie` (cycle 0193). Delivers a new `exec-opencode.ts` ExecModule, REGISTRY registration, `Step.agent` union widening, six unit tests, one workflow parse test, and documentation updates.

## Current State (from Research)
- `ExecModule` interface in `src/engine/exec.ts:7-15` — supports `model?` and `thinking?` (landed cycle 0192)
- `REGISTRY` in `src/engine/exec.ts:25-30` — has `auggie`, `claudecode`, `codex`, `gemini`; `opencode` absent
- `Step.agent` union in `src/engine/workflow.ts:7` — `"claudecode" | "bash" | "codex" | "gemini" | "auggie"`; `"opencode"` absent
- `auggieExec` (`src/engine/exec-auggie.ts:1-13`) — canonical 13-line pattern to mirror exactly
- Tests use `resolveAgent("<agent>")` indirection (intentional — validates REGISTRY registration + exec module in one shot)
- Workflow parse tests follow template at `tests/engine/workflow.test.ts:389-408`

## Desired End State
- `src/engine/exec-opencode.ts` exists, 13 lines, mirrors auggie exactly (s/auggie/opencode)
- `REGISTRY` in `exec.ts` includes `opencode: opencodeExec`
- `Step.agent` union includes `"opencode"`
- `tests/engine/exec-opencode.test.ts` has 6 tests (stdin roundtrip, non-zero exit, --model, --thinking, both flags ordered, ENOENT)
- `tests/engine/workflow.test.ts` has one additional test: `loadConfig` accepts `agent: opencode`
- CLAUDE.md registered agents line includes `opencode`
- `docs/ARCHITECTURE.md` agent table and `agent` field table include `opencode`
- `npm test` passes, typecheck clean, coverage ≥ baseline

## What We're NOT Doing
- Verifying `--model`/`--thinking` flag names against a live `opencode --help`
- Modifying gemini, auggie, codex, or claudecode exec modules
- Changing workflow prompt files or agent registry lookup logic
- Touching `exec-spawn.ts` or `exec-bash.ts`

## Implementation Approach
Pure copy-adapt of the auggie pattern. Four files change (exec.ts, workflow.ts, CLAUDE.md, ARCHITECTURE.md), one new exec module, one new test file, one new test added to workflow.test.ts. No architectural decisions — pattern is fully established.

---

## Task 1: Create `src/engine/exec-opencode.ts`

### Overview
New ExecModule that forwards `--model` and `--thinking` to the `opencode` binary via stdin prompt delivery. Mirrors `exec-auggie.ts` exactly with `s/auggie/opencode`.

### Changes Required
**File**: `src/engine/exec-opencode.ts` (new file)

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: opencode flag names (--model, --thinking) are assumed from codex/auggie parity;
// verify against `opencode --help` once opencode CLI stabilizes.
export const opencodeExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "opencode", argv, promptDelivery: "stdin", ...args });
  },
};
```

### Success Criteria
- [ ] File exists at `src/engine/exec-opencode.ts`
- [ ] `npm run typecheck` clean (no errors)

---

## Task 2: Register `opencode` in REGISTRY and widen `Step.agent`

### Overview
Two one-line changes: import + REGISTRY entry in `exec.ts`; union extension in `workflow.ts`.

### Changes Required

**File**: `src/engine/exec.ts`

Add import after existing exec module imports (line 5):
```typescript
import { opencodeExec } from "./exec-opencode.ts";
```

Add to REGISTRY object (after `gemini` entry):
```typescript
opencode: opencodeExec,
```

**File**: `src/engine/workflow.ts:7`

Change:
```typescript
agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie";
```
To:
```typescript
agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie" | "opencode";
```

### Success Criteria
- [ ] `resolveAgent("opencode")` returns `opencodeExec` without throwing
- [ ] `loadConfig` accepts `agent: opencode` in YAML without throwing
- [ ] `npm run typecheck` clean

---

## Task 3: Write `tests/engine/exec-opencode.test.ts`

### Overview
Six tests mirroring `tests/engine/exec-auggie.test.ts` exactly (s/auggie/opencode). All use `resolveAgent("opencode")` via the REGISTRY — validates registration + exec behavior in one shot.

### Changes Required
**File**: `tests/engine/exec-opencode.test.ts` (new file)

Six tests:
1. `opencode: pipes prompt body to stdin, returns stdout` — fake binary echoes stdin; assert `status:"ok"`, stdout matches prompt body
2. `opencode: non-zero exit surfaces status:failed and captures stderr` — fake binary exits 1 with stderr; assert `status:"failed"`, `exitCode:1`, stderr matches
3. `opencode: --model flag in argv when model is set` — fake binary echoes `$@`; assert stdout matches `/--model/` and model value
4. `opencode: --thinking flag in argv when thinking is set` — same pattern for `--thinking`
5. `opencode: both --model and --thinking flags, model before thinking` — index ordering assertion (`idx_model < idx_thinking`)
6. `opencode: resolves StepResult{status:failed,exitCode:-1} when opencode binary missing (spawn ENOENT)` — PATH `/nonexistent`; assert `status:"failed"`, `exitCode:-1`, `stderr.length > 0`

Each test uses `mkdtemp` for `root` and `bin`, writes fake binary to `bin/opencode`, cleans up in `finally`.

### Success Criteria
- [ ] All 6 tests pass via `npm test`
- [ ] No flags appear in argv when neither `model` nor `thinking` is set (verified by test 1: stdin roundtrip only, no argv in stdout)

---

## Task 4: Add workflow parse test to `tests/engine/workflow.test.ts`

### Overview
One additional test mirroring the auggie parse test at line 389-408. Confirms `loadConfig` accepts `agent: opencode` without throwing and returns correct step fields.

### Changes Required
**File**: `tests/engine/workflow.test.ts`

Add after the auggie test (after line 408):
```typescript
test("parses a workflow step with agent: opencode", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: impl
        agent: opencode
        prompt: prompts/impl.md
`);
    const cfg = await loadConfig(root);
    const step = cfg.workflows[0].steps[0];
    assert.equal(step.agent, "opencode");
    assert.equal(step.prompt, "prompts/impl.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test passes
- [ ] `loadConfig` accepts `agent: opencode` step without throwing

---

## Task 5: Update documentation

### Overview
Two documentation files need updating: CLAUDE.md (registered agents line) and `docs/ARCHITECTURE.md` (agent field table + agents table).

### Changes Required

**File**: `CLAUDE.md:59`

Change the registered agents line from:
```
Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.
```
To:
```
Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.
```

**File**: `docs/ARCHITECTURE.md:455`

Change agent field table row:
```
| `agent` | One of `claudecode`, `codex`, `gemini`, `auggie`, `bash` |
```
To:
```
| `agent` | One of `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `bash` |
```

Also update model/thinking description row at line 458-459:
```
| `model` | Override model for this step (codex/auggie: passed as `--model`) |
| `thinking` | Thinking level for this step (codex/auggie: passed as `--thinking`) |
```
To:
```
| `model` | Override model for this step (codex/auggie/opencode: passed as `--model`) |
| `thinking` | Thinking level for this step (codex/auggie/opencode: passed as `--thinking`) |
```

Add `opencode` row to Agents table at line 471 (after `auggie` row):
```
| `opencode` | `opencode` subprocess (stdin prompt delivery; optional `--model`/`--thinking` flags) | Alternative for build / fix / review |
```

### Success Criteria
- [ ] CLAUDE.md registered agents line includes `opencode`
- [ ] ARCHITECTURE.md agent field table includes `opencode`
- [ ] ARCHITECTURE.md agents table has `opencode` row

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-opencode.ts` exists and implements `ExecModule` | Task 1 | |
| `[ ] opencode` registered in `REGISTRY` in `src/engine/exec.ts` | Task 2 | |
| `[ ] Step.agent` union in `src/engine/workflow.ts` includes `"opencode"` | Task 2 | |
| `[ ] --model <value>` forwarded when `model` is set on an opencode step | Task 3 (test 3) | |
| `[ ] --thinking <value>` forwarded when `thinking` is set on an opencode step | Task 3 (test 4) | |
| `[ ] Neither flag appears in argv when the fields are absent` | Task 3 (test 1) | stdin roundtrip: no argv echoed |
| `[ ] Unit test: loadConfig` accepts a step with `agent: "opencode"` without throwing | Task 4 | |
| `[ ] All existing tests still pass` | Tasks 1–5 | no existing code deleted or altered beyond targeted lines |
| `[ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)` | Task 3 | 6 tests cover all branches in exec-opencode.ts |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean)` | Tasks 1–2 | type-safe import chain; union widening is additive |

---

## Testing Strategy

### Unit Tests
- `tests/engine/exec-opencode.test.ts` — 6 tests covering all ExecModule behavior
- Fake binaries via `mkdtemp`/`chmod 0o755` — no heavy mocking, real spawn
- ENOENT test uses `PATH: "/nonexistent"` — real spawn failure path
- Both-flags test uses index ordering assertion to enforce argv order

### Integration / E2E Tests
- Workflow parse test in `tests/engine/workflow.test.ts` — real `loadConfig` call with YAML containing `agent: opencode`

## Risk Assessment
- **Wrong flag names for opencode CLI**: Mitigated by TODO comment; runtime concern only, not a build/test concern
- **Coverage regression**: Mitigated by 6 tests covering all branches (model/thinking present/absent = 4 branches + error paths)
- **Import order or REGISTRY typo**: Caught immediately by `npm run typecheck` and the ENOENT test (which goes through `resolveAgent`)
```
