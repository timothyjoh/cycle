`★ Insight ─────────────────────────────────────`
Five cycles of the same pattern (codex → auggie → opencode → pi) means the plan is almost purely mechanical substitution. The only genuine risk is missing one of the three required file triplets: exec module + REGISTRY entry + type union — any two without the third produces a partial failure.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0195

## Overview
Add `pi` as a first-class agent in the cycle engine, following the identical
pattern from `codex` (0192), `auggie` (0193), and `opencode` (0194). After
this cycle, workflow YAML steps may specify `agent: pi` with optional `model`
and `thinking` fields that are forwarded as `--model`/`--thinking` CLI flags.

## Current State (from Research)

- **REGISTRY** (`src/engine/exec.ts:26-32`): five entries — `auggie`,
  `claudecode`, `codex`, `gemini`, `opencode`. No `pi`.
- **Step.agent union** (`src/engine/workflow.ts:7`): `"claudecode" | "bash" |
  "codex" | "gemini" | "auggie" | "opencode"`. `"pi"` absent.
- **ExecModule interface** (`src/engine/exec.ts:8-16`): already accepts
  `model?` and `thinking?` — no changes needed to the interface.
- **Canonical template**: `src/engine/exec-opencode.ts` (13 lines) — direct
  copy-and-substitute for `pi`.
- **Canonical test template**: `tests/engine/exec-opencode.test.ts` (6 tests,
  166 lines) — direct copy-and-substitute for `pi`.
- **Workflow parsing test location**: `tests/engine/workflow.test.ts:410-429`
  (opencode test); new `pi` test appended immediately after.

## Desired End State

- `src/engine/exec-pi.ts` — new file, 13 lines, exports `piExec: ExecModule`.
- `src/engine/exec.ts` — import for `piExec` at line 7; `pi: piExec` in
  REGISTRY.
- `src/engine/workflow.ts:7` — union includes `"pi"`.
- `tests/engine/exec-pi.test.ts` — 6 tests; all pass.
- `tests/engine/workflow.test.ts` — one new `"parses a workflow step with
  agent: pi"` test at end of current opencode block.
- `CLAUDE.md` — registered step agents line includes `pi`.
- `docs/ARCHITECTURE.md` — Step fields table and Agents table include `pi`.
- `npm test` passes; `npm run typecheck` clean; coverage gates hold.

## What We're NOT Doing

- Verifying actual `pi` CLI flag names against `pi --help` (documented as
  TODO comment in source, matching opencode/auggie convention).
- Modifying any existing exec module (gemini, auggie, codex, opencode,
  claudecode).
- Changing workflow prompt files, `exec-spawn.ts`, or agent lookup logic.
- Any README.md changes (no user-facing change required per SPEC).
- Structural invariant for agent fleet consistency (tracked separately in
  `refl-0194`; out of scope here).

## Implementation Approach

Pure pattern replication. Each task is one atomic change; later tasks build
on earlier ones only for import/type reasons. Tasks 1–3 constitute the
runtime surface; Tasks 4–5 are the tests; Task 6 is documentation.
All six tasks are required before any task is considered done.

---

## Task 1: Create `src/engine/exec-pi.ts`

### Overview
New ExecModule that spawns the `pi` binary with optional `--model` and
`--thinking` flags. Exact copy-and-substitute of `exec-opencode.ts`.

### Changes Required
**File**: `src/engine/exec-pi.ts` *(new file)*

```ts
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: pi flag names (--model, --thinking) are assumed from codex/auggie/opencode parity;
// verify against `pi --help` once pi CLI stabilizes.
export const piExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "pi", argv, promptDelivery: "stdin", ...args });
  },
};
```

### Success Criteria
- [ ] File exists at `src/engine/exec-pi.ts`
- [ ] Exports `piExec` satisfying `ExecModule`
- [ ] `npm run typecheck` clean after this file alone

---

## Task 2: Register `pi` in REGISTRY (`src/engine/exec.ts`)

### Overview
Two-line change: import the new module; add `pi: piExec` to the REGISTRY
object literal.

### Changes Required
**File**: `src/engine/exec.ts`

Add import at line 7 (after the existing `opencodeExec` import):
```ts
import { piExec } from "./exec-pi.ts";
```

Add entry to REGISTRY (lines 26–32), keeping alphabetical order:
```ts
const REGISTRY: Record<string, ExecModule> = {
  auggie: auggieExec,
  claudecode: claudecodeExec,
  codex: codexExec,
  gemini: geminiExec,
  opencode: opencodeExec,
  pi: piExec,        // ← new
};
```

### Success Criteria
- [ ] `resolveAgent("pi")` no longer throws `UnknownAgentError`
- [ ] `npm run typecheck` clean
- [ ] No other REGISTRY entries changed

---

## Task 3: Widen `Step.agent` union in `src/engine/workflow.ts`

### Overview
Add `"pi"` to the string-literal union on line 7.

### Changes Required
**File**: `src/engine/workflow.ts:7`

Before:
```ts
  agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie" | "opencode";
```
After:
```ts
  agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie" | "opencode" | "pi";
```

### Success Criteria
- [ ] TypeScript accepts `agent: "pi"` in a `Step` value
- [ ] `npm run typecheck` clean
- [ ] `loadConfig` round-trips a YAML step with `agent: pi` without throwing

---

## Task 4: Write `tests/engine/exec-pi.test.ts` (6 tests)

### Overview
Direct copy-and-substitute of `tests/engine/exec-opencode.test.ts`, replacing
every `"opencode"` string reference with `"pi"`, every `opencode-*` test label
with `pi-*`, and every file named `opencode` with `pi`.

### Changes Required
**File**: `tests/engine/exec-pi.test.ts` *(new file)*

Six tests, in order:
1. `"pi: pipes prompt body to stdin, returns stdout"` — fake binary `cat`;
   asserts `status === "ok"`, stdout matches `"pi-stdin-roundtrip"`.
2. `"pi: non-zero exit surfaces status:failed and captures stderr"` — fake
   binary `echo boom >&2; exit 1`; asserts `status === "failed"`, exitCode 1,
   stderr matches `/boom/`.
3. `"pi: --model flag in argv when model is set"` — fake binary `echo "$@"`;
   `model: "claude-sonnet-4-5"`; asserts stdout matches `/--model/` and
   `/claude-sonnet-4-5/`.
4. `"pi: --thinking flag in argv when thinking is set"` — fake binary
   `echo "$@"`; `thinking: "high"`; asserts stdout matches `/--thinking/` and
   `/high/`.
5. `"pi: both --model and --thinking flags, model before thinking"` — fake
   binary `echo "$@"`; both set; asserts `idx_model < idx_thinking`.
6. `"pi: resolves StepResult{status:failed,exitCode:-1} when pi binary missing
   (spawn ENOENT)"` — `PATH: "/nonexistent"`; asserts `status === "failed"`,
   `exitCode === -1`, `stderr.length > 0`.

### Success Criteria
- [ ] All 6 tests pass via `npm test`
- [ ] `exec-pi.ts` reaches 100% line coverage from this file alone
- [ ] No flags appear in argv in tests 1, 2, and 6

---

## Task 5: Add workflow parsing test to `tests/engine/workflow.test.ts`

### Overview
Append one new test immediately after the `opencode` workflow test at line 429,
following exact same structure.

### Changes Required
**File**: `tests/engine/workflow.test.ts` — append after line 429:

```ts
test("parses a workflow step with agent: pi", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: impl
        agent: pi
        prompt: prompts/impl.md
`);
    const cfg = await loadConfig(root);
    const step = cfg.workflows[0].steps[0];
    assert.equal(step.agent, "pi");
    assert.equal(step.prompt, "prompts/impl.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] New test passes
- [ ] `loadConfig` accepts `agent: pi` without throwing
- [ ] All pre-existing workflow tests still pass

---

## Task 6: Update documentation

### Overview
Two documentation files require updates: `CLAUDE.md` (registered agents line)
and `docs/ARCHITECTURE.md` (two table entries).

### Changes Required

**File**: `CLAUDE.md`

Find the registered step agents line and append `pi` with identical phrasing:

Before:
```
Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.
```

After (append `, \`pi\` (first-class; ...)` before the `bash` sentence):
```
Registered step agents (via resolveAgent): `claudecode`, `codex` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `gemini`, `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags), `pi` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags). `bash` steps are dispatched directly via `execBashStep`, not through the agent registry.
```

**File**: `docs/ARCHITECTURE.md`

*Step fields table* (`agent` column value list, ~line 453–460): add `pi` to
the list of valid agent values alongside `claudecode`, `codex`, `gemini`,
`auggie`, `opencode`, `bash`.

*Agents table* (~line 466–473): add a new row for `pi`:
```
| pi | subprocess (stdin prompt delivery; optional --model/--thinking flags) |
```
Place it after the `opencode` row, before `bash`.

### Success Criteria
- [ ] `CLAUDE.md` registered agents line includes `pi`
- [ ] `docs/ARCHITECTURE.md` Step fields table lists `pi` as valid agent
- [ ] `docs/ARCHITECTURE.md` Agents table has a `pi` row

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`src/engine/exec-pi.ts\` exists and implements \`ExecModule\`` | Task 1 | |
| `[ ] \`pi\` registered in \`REGISTRY\` in \`src/engine/exec.ts\`` | Task 2 | |
| `[ ] \`Step.agent\` union in \`src/engine/workflow.ts\` includes \`"pi"\`` | Task 3 | |
| `[ ] \`--model <value>\` forwarded when \`model\` is set on a pi step` | Task 1, Task 4 (test 3) | exec-pi.ts implements; test 3 verifies |
| `[ ] \`--thinking <value>\` forwarded when \`thinking\` is set on a pi step` | Task 1, Task 4 (test 4) | exec-pi.ts implements; test 4 verifies |
| `[ ] Neither flag appears in argv when the fields are absent` | Task 4 (tests 1, 2, 6) | Tests 1/2/6 omit model/thinking; fake binary echoes args |
| `[ ] Unit test: \`loadConfig\` accepts a step with \`agent: "pi"\` without throwing` | Task 5 | |
| `[ ] All existing tests still pass` | Tasks 1–6 | No existing files modified except type union and import block |
| `[ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)` | Task 4 | 6 tests cover all branches in exec-pi.ts |
| `[ ] No compiler/linter warnings introduced (\`npm run typecheck\` clean)` | Tasks 1–3 | Verified per-task in success criteria |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/exec-pi.test.ts`** (6 tests): covers all four code paths in
  `exec-pi.ts` — no flags, model only, thinking only, both, stdin roundtrip,
  and spawn ENOENT. Fake binaries replace the real `pi` binary; no mocking of
  `runAgent` or `exec-spawn.ts`.
- Each test isolates PATH via `env: { PATH: \`${bin}:${process.env.PATH}\` }`,
  keeping the real environment stable.
- Two temp dirs per test (repo root + fake-binary dir); both cleaned up in
  `finally` regardless of assertion failure.

### Integration / E2E Tests
- **`tests/engine/workflow.test.ts`** (1 new test): verifies `loadConfig`
  end-to-end — writes real YAML to disk, parses it, asserts `step.agent ===
  "pi"`. No mocking.
- `npm test` runs the full 535+ test suite; any regression in existing agents
  surfaces immediately.

## Risk Assessment
- **Flag name assumption**: `--model` and `--thinking` are assumed from
  codex/auggie/opencode parity. The TODO comment in source documents this
  explicitly. Mitigation: the comment names the verification action; a future
  cycle can correct flag names once `pi --help` is confirmed.
- **Coverage gate breach**: new `exec-pi.ts` without tests would create an
  uncovered file. Mitigation: Task 4 provides 6 tests with full branch
  coverage before `npm run test:coverage` runs.
- **Missing one of the three triplet files** (exec module / REGISTRY / type
  union): would produce a partial, type-unsafe state. Mitigation: Tasks 1–3
  are sequential; each has explicit typecheck success criteria.
```
