# Implementation Plan: Cycle 0229

## Overview

Extend the `feature` workflow with `final_fix` (conditional claudecode step) and `final_verify` (bash step) inserted between `reflection` and `documentation`. Add `final_fix` to the engine's touched-file accumulation. Add a soft self-check line to `build.md`, `fix.md`, and the new `final_fix.md`.

## Current State (from Research)

- `src/defaults/workflows.yml` feature workflow has 9 steps ending `… reflection → documentation`; no `final_fix` or `final_verify` slots.
- `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` at `run-cycle.ts:27` governs both pre-step snapshot capture (line 312) and `accumulateTouchedFiles` invocation (line 390). Adding `"final_fix"` is the single engine change needed.
- `ARTIFACT_STEPS = new Set([…"fix", "documentation"])` at `run-cycle.ts:35` governs `ARTIFACT_SUPPRESS_PROMPT` injection. `final_fix` is a claudecode artifact step and must be added.
- `skip_unless` gate (`run-cycle.ts:263-281`) is fully generic; emits `step.end {status:"skipped", reason:"skip_unless_artifact_missing"}` with no code change needed.
- `step.name === "fix"` guards at lines 358-368 (MUST-FIX task count) and 369-380 (empty-diff) are keyed on literal `"fix"`; `final_fix` bypasses both automatically.
- `build.md` (line 113) and `fix.md` (line 96) lack the soft self-check line.
- `src/defaults/prompts/final_fix.md` does not exist.
- Test patterns: `run-cycle.skip-unless.test.ts` and `run-cycle.touched-json.test.ts` provide the exact fixture/fake-agent patterns to follow.

## Desired End State

After this cycle:
- `feature` workflow step sequence: `… reflection → final_fix (skip_unless: FINAL_FIXES.md) → final_verify (bash: scripts/verify.sh) → documentation`
- `RESET_ELIGIBLE_STEPS` contains `"final_fix"`; `ARTIFACT_STEPS` contains `"final_fix"`
- `src/defaults/prompts/final_fix.md` exists with FILE ARTIFACT MODE header, FINAL_FIXES.md input, touched.json footprint constraint, and soft self-check
- `build.md` and `fix.md` each contain `Do not finish this step until the full test suite passes (\`npm test\`).`
- `src/defaults/` and `.cycle/` copies are byte-identical
- Four new tests in `tests/engine/run-cycle.final-fix.test.ts` covering skip path, run path, footprint append, and resume dedup
- `npm test` passes; coverage gates hold; per-file floor for `run-cycle.ts` (90%) does not regress

Verification: `grep -n "final_fix\|final_verify" src/defaults/workflows.yml` shows both new steps; `npm test && npm run test:coverage` exits 0.

## What We're NOT Doing

- Reflection writing `FINAL_FIXES.md` (redesign-07, separate cycle)
- Any change to how `final_fix` determines what to fix beyond reading `FINAL_FIXES.md`
- Modifying `quickfix`, `bug`, `e2e-tests`, or `document` workflow variants
- Adding a structural invariant for `RESET_ELIGIBLE_STEPS` membership (SPEC explicitly excludes this)
- Making `final_fix` or `final_verify` non-fatal on failure
- Adding `"final_fix"` to `SKIP_ELIGIBLE_STEPS` (it mutates the tree)

## Implementation Approach

Four targeted code locations plus two file operations and one new test file. All changes are additive — no existing guard logic is modified. The `skip_unless` mechanism, `accumulateTouchedFiles`, and `ARTIFACT_SUPPRESS_PROMPT` all work generically; this cycle only adds membership to the right sets and slots the steps into the YAML. Tests follow the established `mkdtemp`/fake-claude/`runCycle` pattern from the two existing touched-json and skip-unless test files.

---

## Task 1: Engine Constants — `RESET_ELIGIBLE_STEPS` and `ARTIFACT_STEPS`

### Overview

Add `"final_fix"` to both sets in `run-cycle.ts`. This single change wires pre-step snapshot capture, post-step `accumulateTouchedFiles`, and `ARTIFACT_SUPPRESS_PROMPT` injection for the new step.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Line 27 — change:
```ts
const RESET_ELIGIBLE_STEPS = new Set(["build", "fix"]);
```
to:
```ts
const RESET_ELIGIBLE_STEPS = new Set(["build", "fix", "final_fix"]);
```

Line 35 — change:
```ts
const ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "documentation"]);
```
to:
```ts
const ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "final_fix", "documentation"]);
```

No other changes to `run-cycle.ts`. The snapshot capture condition at line 312, `accumulateTouchedFiles` call at line 390, and `appendSystemPrompt` injection at line 322 all derive from these two sets.

### Success Criteria

- [ ] `RESET_ELIGIBLE_STEPS` contains `"final_fix"` (3 members)
- [ ] `ARTIFACT_STEPS` contains `"final_fix"` (8 members)
- [ ] `npm run typecheck` passes with no warnings
- [ ] `npm test` passes (no behavior change for existing steps)

---

## Task 2: Workflow YAML — Insert `final_fix` and `final_verify` Steps

### Overview

Insert two new step definitions in `src/defaults/workflows.yml` between the `reflection` and `documentation` steps of the `feature` workflow.

### Changes Required

**File**: `src/defaults/workflows.yml`

Replace lines 27-28:
```yaml
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```
with:
```yaml
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: final_fix,     agent: claudecode, prompt: prompts/final_fix.md, skip_unless: FINAL_FIXES.md }
      - { name: final_verify,  agent: bash,       command: scripts/verify.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

The `document`, `quickfix`, and `e2e-tests` workflows are not touched.

### Success Criteria

- [ ] `feature` workflow in `src/defaults/workflows.yml` has 11 steps in the sequence: `spec → research → plan → build → review → fix → verify → reflection → final_fix → final_verify → documentation`
- [ ] `final_fix` has `agent: claudecode`, `prompt: prompts/final_fix.md`, `skip_unless: FINAL_FIXES.md`
- [ ] `final_verify` has `agent: bash`, `command: scripts/verify.sh`, no `skip_unless`
- [ ] No other workflow variants modified
- [ ] `npm run typecheck` still passes

---

## Task 3: Create `src/defaults/prompts/final_fix.md`

### Overview

Create the prompt file for the `final_fix` step. Follows the `fix.md` structure: FILE ARTIFACT MODE directive, role description, discovery steps, input specification, footprint constraint, soft self-check, and output format.

### Changes Required

**File**: `src/defaults/prompts/final_fix.md` (new file)

```markdown
FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.

# Apply Final Fixes

You are the Final Fix agent. Apply the in-cycle remediations listed in
`FINAL_FIXES.md` — this is your sole input.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **`FINAL_FIXES.md`**: `docs/cycle/<cycle_id>-<workflow>-<slug>/FINAL_FIXES.md`
   — your task list. **This is your primary input.** This step is
   skipped when the file is absent.
3. **`touched.json`**: `docs/cycle/<cycle_id>-<workflow>-<slug>/touched.json`
   — authoritative list of files this cycle has touched. Edits must
   stay within this footprint (plus tests and docs).
4. **`SPEC.md`** and **`PLAN.md`** in the same artifact directory —
   reference for acceptance criteria.

## Rules

- Apply only the fixes listed in `FINAL_FIXES.md`. Do not make
  unrequested changes.
- Edits must stay within the files listed in `touched.json`, plus test
  files and documentation files. Do not touch files outside this
  footprint without a clear requirement in `FINAL_FIXES.md`.
- Do not finish this step until the full test suite passes (`npm test`).

## File Artifact Mode

Do not include any of the following in your output:
- Insight blocks or star-marker commentary
- Confirmation sentences ("I have applied…", "Done.")
- Trailing commentary addressed to the reader

**WRONG** (contaminated output — do not produce this):
> I've applied the two fixes from FINAL_FIXES.md and verified that tests pass.
>
> Here is the summary...

**CORRECT** (clean artifact output — produce only this):
> ## Summary
> Applied fix 1: …

## Output

Output a brief summary to stdout describing which tasks from
`FINAL_FIXES.md` you addressed, the final test-suite outcome, and any
tasks you could not fix. The engine captures stdout and writes it to
`FINAL_FIX.md` in the same artifact directory.
```

### Success Criteria

- [ ] `src/defaults/prompts/final_fix.md` exists
- [ ] First line is the FILE ARTIFACT MODE directive (byte-identical to `build.md` line 1)
- [ ] File references `FINAL_FIXES.md` as input and `touched.json` as footprint constraint
- [ ] Soft self-check line present: `Do not finish this step until the full test suite passes (\`npm test\`).`

---

## Task 4: Add Soft Self-Check to `build.md` and `fix.md`

### Overview

Insert the soft self-check line in `build.md` and `fix.md` immediately before their respective output paragraphs. Placement is just before the paragraph beginning with "The engine captures stdout" (`build.md:113`) and just before the paragraph beginning with "Also output" (`fix.md:96`).

### Changes Required

**File**: `src/defaults/prompts/build.md`

Before the final paragraph (line 113: "The engine captures stdout…"), insert:

```
Do not finish this step until the full test suite passes (`npm test`).

```

**File**: `src/defaults/prompts/fix.md`

Before the paragraph (line 96: "Also output a one-paragraph **summary to stdout**…"), insert:

```
Do not finish this step until the full test suite passes (`npm test`).

```

### Success Criteria

- [ ] `build.md` contains the exact line `Do not finish this step until the full test suite passes (\`npm test\`).`
- [ ] `fix.md` contains the same exact line
- [ ] No other content in either file is changed

---

## Task 5: Sync Defaults

### Overview

Mirror all `src/defaults/` changes to `.cycle/` so both copies are byte-identical.

### Changes Required

Run `npm run sync-defaults` after completing Tasks 2, 3, and 4.

This produces:
- `.cycle/workflows.yml` ← updated from `src/defaults/workflows.yml`
- `.cycle/prompts/final_fix.md` ← copied from `src/defaults/prompts/final_fix.md`
- `.cycle/prompts/build.md` ← updated from `src/defaults/prompts/build.md`
- `.cycle/prompts/fix.md` ← updated from `src/defaults/prompts/fix.md`

### Success Criteria

- [ ] `diff src/defaults/workflows.yml .cycle/workflows.yml` exits 0
- [ ] `diff src/defaults/prompts/final_fix.md .cycle/prompts/final_fix.md` exits 0
- [ ] `diff src/defaults/prompts/build.md .cycle/prompts/build.md` exits 0
- [ ] `diff src/defaults/prompts/fix.md .cycle/prompts/fix.md` exits 0

---

## Task 6: New Tests — `tests/engine/run-cycle.final-fix.test.ts`

### Overview

Four test cases covering the SPEC-required scenarios: skip path, run path, footprint append, and resume dedup. Follows the fixture/fake-claude/`runCycle` pattern from `run-cycle.skip-unless.test.ts` and `run-cycle.touched-json.test.ts`.

### Changes Required

**File**: `tests/engine/run-cycle.final-fix.test.ts` (new file)

The file uses:
- `workflowYml(stepsBody)` helper (same pattern as `run-cycle.touched-json.test.ts:15-31`)
- `setupGitRepo(root)` helper (same pattern as `run-cycle.touched-json.test.ts:33-41`)
- `expectExactlyOne` from `tests/helpers.ts`
- `parseLogTail` from `src/engine/log-tail.ts` (for the resume dedup test)

**Test 1 — Skip path** (`final_fix` skipped when `FINAL_FIXES.md` absent):

Fixture workflow: `final_fix` (skip_unless: FINAL_FIXES.md) + `final_verify` (bash: `scripts/verify.sh`). Artifact dir created but no `FINAL_FIXES.md`. Fake `verify.sh` exits 0.

Assertions:
- `result.status === "ok"`
- Log contains `step.end` with `step:"final_fix"`, `status:"skipped"`, `reason:"skip_unless_artifact_missing"`, `artifact:"FINAL_FIXES.md"`
- Log contains `step.start` for `final_verify` (i.e., `final_verify` still runs after skip)
- `expectExactlyOne(events, "step.end")` is not used for skipped events — use `filter` cardinality check on the raw log

**Test 2 — Run path** (`final_fix` runs when `FINAL_FIXES.md` present):

Same fixture workflow. `FINAL_FIXES.md` placed in artifact dir. Fake `claude` binary appends a file and prints a summary.

Assertions:
- `result.status === "ok"`
- Log contains `step.start` with `step:"final_fix"`
- Log contains `step.end` with `step:"final_fix"`, `status:"ok"`
- Log does NOT contain `status:"skipped"` for `final_fix`

**Test 3 — Footprint append** (`touched.json` updated with `final_fix` delta):

Fixture workflow: `final_fix` only (no `final_verify` needed). `FINAL_FIXES.md` present. Fake `claude` creates `src/final-fixed.ts` and stages it. Pre-existing dirty file `src/existing.ts` must be excluded.

Assertions:
- `result.status === "ok"`
- `touched.json` contains `"src/final-fixed.ts"`
- `touched.json` does NOT contain `"src/existing.ts"` (was dirty before step)
- `touched.json` files array is sorted

**Test 4 — Resume dedup** (`final_verify` not collapsed with `verify` on resume):

Pure log-parse test (no `runCycle` invocation). Construct a synthetic JSONL string with:
```
cycle.start …
step.end { step: "verify", status: "ok" }
step.end { step: "reflection", status: "ok" }
```

Assertions using `parseLogTail`:
- `completedSteps` contains `"verify"` and `"reflection"`
- `completedSteps` does NOT contain `"final_verify"` (i.e., `final_verify` is not treated as done just because `verify` is done)

### Success Criteria

- [ ] All four tests pass
- [ ] `expectExactlyOne` used for cardinality-sensitive event assertions
- [ ] Test 3 verifies `touched.json` sorted union and excludes pre-existing dirty files
- [ ] Test 4 uses `parseLogTail` directly (no `runCycle` call needed)
- [ ] No test creates global state; all use `mkdtemp` + `rm` cleanup in `finally`

---

## Task 7: Update `docs/ENGINE.md`

### Overview

Document the new step sequence, the `skip_unless: FINAL_FIXES.md` skip contract, and that `final_fix` delta is included in `touched.json`.

### Changes Required

**File**: `docs/ENGINE.md`

Locate the section describing the feature workflow step sequence (or the touched.json footprint section). Add:

1. Update any step sequence diagram or prose to show: `… reflection → final_fix → final_verify → documentation`
2. Under the touched.json / footprint section, add: "`final_fix` is included in `RESET_ELIGIBLE_STEPS`; its git delta is appended to `touched.json` after the step completes."
3. Document the `skip_unless` contract: "`final_fix` is always skipped while `FINAL_FIXES.md` is absent from the artifact directory (redesign-07 will produce this file). `final_verify` runs regardless of whether `final_fix` was skipped."

### Success Criteria

- [ ] ENGINE.md mentions `final_fix` and `final_verify` in the step sequence
- [ ] ENGINE.md documents the `skip_unless: FINAL_FIXES.md` skip contract
- [ ] ENGINE.md notes that `final_fix` delta joins `touched.json`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`feature\` workflow in \`src/defaults/workflows.yml\` contains step sequence \`reflection → final_fix → final_verify → documentation\` with correct agent, prompt, command, and \`skip_unless\` fields.` | Task 2 | |
| `[ ] With no \`FINAL_FIXES.md\` in the artifact dir, \`final_fix\` step emits \`step.skipped\` and \`final_verify\` still executes.` | Task 6 (Test 1) | Note: actual event is `step.end {status:"skipped"}` per existing engine behavior — SPEC uses "step.skipped" loosely; test asserts the real event shape |
| `[ ] With a \`FINAL_FIXES.md\` present, \`final_fix\` runs and \`touched.json\` is updated with its git delta after the step completes.` | Task 6 (Tests 2 & 3) | |
| `[ ] \`final_verify\` step name is the literal string \`"final_verify"\` in both the YAML and all emitted log events — it is never confused with \`verify\` on resume.` | Task 2 + Task 6 (Test 4) | |
| `[ ] \`final_fix\` does not trigger the \`step.name === "fix"\` empty-diff guard or MUST-FIX guard in \`run-cycle.ts\`.` | Task 1 | No code change needed; `"final_fix" !== "fix"` by construction; Test 2 indirectly confirms |
| `[ ] \`src/defaults/prompts/final_fix.md\` exists; \`.cycle/prompts/final_fix.md\` is byte-identical after \`npm run sync-defaults\`.` | Task 3 + Task 5 | |
| `[ ] \`build.md\` and \`fix.md\` in both \`src/defaults/prompts/\` and \`.cycle/prompts/\` contain the soft self-check line.` | Task 4 + Task 5 | |
| `[ ] \`src/defaults/workflows.yml\` and \`.cycle/workflows.yml\` are byte-identical after \`npm run sync-defaults\`.` | Task 2 + Task 5 | |
| `[ ] Tests cover: skip path (no \`FINAL_FIXES.md\` → step skipped, \`final_verify\` still runs), run path (\`FINAL_FIXES.md\` present → step executes), footprint append (\`touched.json\` updated with \`final_fix\` delta), resume correctness (\`final_verify\` not collapsed with \`verify\`).` | Task 6 | All four scenarios in `run-cycle.final-fix.test.ts` |
| `[ ] \`npm test\` passes; \`npm run test:coverage\` passes with line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors hold.` | All tasks | Verified after Task 6 |
| `[ ] All existing tests still pass; no compiler or linter warnings introduced.` | All tasks | Verified after Task 6 |

---

## Testing Strategy

### Unit Tests

**`tests/engine/run-cycle.final-fix.test.ts`** (new file, 4 tests):

- **Test 1 (skip path)**: Minimal two-step fixture (`final_fix` + `final_verify`). Assert `step.end {status:"skipped"}` for `final_fix` and `step.start` for `final_verify`. Fake `verify.sh` at `.cycle/scripts/verify.sh` that exits 0; place it via `writeFile` in the temp repo.
- **Test 2 (run path)**: Same fixture, `FINAL_FIXES.md` present. Fake `claude` appends a line to `src/stub.ts` and prints a summary. Assert `step.end {status:"ok"}` for `final_fix`.
- **Test 3 (footprint append)**: Single `final_fix` step fixture. Pre-dirty `src/existing.ts` before step. Fake `claude` creates `src/final-fixed.ts`. Assert `touched.json` includes `src/final-fixed.ts`, excludes `src/existing.ts`.
- **Test 4 (resume dedup)**: Synthetic JSONL only. Pass to `parseLogTail`. Assert `completedSteps` includes `"verify"` but not `"final_verify"` — confirming the two step names are treated as distinct.

**Mocking**: fake `claude` binary (bash script) is the only mock. All file I/O and git operations use real `spawnSync`/node:fs — no stubs. `scripts/verify.sh` is faked via a minimal bash script that exits 0.

### Integration / E2E Tests

No E2E tests required per SPEC. The four unit tests exercise the full `runCycle` → engine → log path end-to-end for the new behavior.

## Risk Assessment

- **`final_verify` runs `scripts/verify.sh` in tests**: the test repo has no `package.json`, so `verify.sh`'s check for `"test"` key will skip `npm test`. This is fine — the script exits 0 for repos without a test key. Confirmed by reading `src/defaults/scripts/verify.sh:1-17`. No special setup needed.
- **`final_fix` artifact is `FINAL_FIX.md`, not `FINAL_FIXES.md`**: `step.name.toUpperCase()` → `FINAL_FIX.md`. This is intentional and does not collide with the `FINAL_FIXES.md` guard file. No downstream reader in this cycle reads `FINAL_FIX.md`.
- **Coverage regression on `run-cycle.ts`**: new set members are exercised by Tests 1-3 (snapshot capture path and `accumulateTouchedFiles` path both touched). The 90% per-file floor should hold given the new tests add coverage. Monitor after `npm run test:coverage`.
- **sync-defaults divergence guard**: if `npm run sync-defaults` is run before all `src/defaults/` changes are complete, it may overwrite an intermediate state. Always run sync-defaults as a single final step (Task 5) after Tasks 2, 3, and 4 are complete.
