Now I have all I need. Resolving the three open questions from RESEARCH before writing the plan:

1. **`no_branch: true` field**: Silently ignored by parser (no `Workflow` type field). New tests should include it as a documentary marker, relying on `engine.commit.mode: trunk` for actual behavior. No production code changes needed.

2. **Helper variant**: Create `workflowYmlNoBranch()` — don't modify existing `workflowYml()` since existing tests pass and adding `no_branch: true` to them would be a no-op change with no value. New variant keeps concerns clean.

3. **Log parsing**: Add local `parseLog(logStr: string)` helper (splits by `\n`, `JSON.parse` each line) rather than inlining. One-liner, reusable within the file.

```markdown
# Implementation Plan: Cycle 0150

## Overview
Add two new test cases to `tests/engine/run-cycle.documentation.test.ts` covering the `documentation` step inside a trunk-based (`no_branch: true`) workflow: a happy-path case asserting `DOCUMENTATION.md` is written and `step.start` has no `head_sha` field, and a non-fatal-failure case asserting `documentation.skipped` is emitted while `cycle.end` remains `ok`.

## Current State (from Research)
- `tests/engine/run-cycle.documentation.test.ts` has 2 tests, both use `workflowYml()` with `engine.commit.mode: trunk`. Neither imports `expectExactlyOne` from `tests/helpers.ts`. Neither asserts `head_sha` absence.
- `workflowYml()` already produces `mode: trunk` with no `pr` step — the new tests only need a variant that adds `no_branch: true` to the workflow entry (a no-op field, silently ignored by `loadConfig()`, but required by SPEC for documentary fidelity).
- `expectExactlyOne` is already exported from `tests/helpers.ts` (landed cycle 0149).
- `head_sha` is conditionally omitted from `step.start` via `...(headSha ? { head_sha: headSha } : {})` in `run-cycle.ts:200–205`. Since `documentation` is not in `RESET_ELIGIBLE_STEPS`, `headSha` is always `null` — so `head_sha` is never emitted for `documentation` regardless of commit mode.
- `documentation` non-fatal path in `run-cycle.ts:251–254` emits `documentation.skipped` then `continue`s — never flips `cycle.end` to `failed`.

## Desired End State
`tests/engine/run-cycle.documentation.test.ts` has 4 tests total: the 2 existing plus:
- `runCycle: documentation step success in no_branch workflow writes DOCUMENTATION.md; step.start has no head_sha`
- `runCycle: documentation step exec-failure in no_branch workflow emits documentation.skipped; cycle.end ok`

Both new tests import and use `expectExactlyOne` for cardinality-pinned event assertions. `npm run test:coverage` and `npm run check:invariants` pass with no regression.

## What We're NOT Doing
- No changes to `src/engine/run-cycle.ts` or any production code.
- No implementation of the `no_branch` field as a real behavioral toggle in `workflow.ts`.
- No coverage added for other steps (build, fix, etc.) under `no_branch`.
- No fix for the orphaned-doc-edits sharp edge (`refl-0052-documentation-step-edits-orphaned-no-commit`).
- No extraction of shared test helpers to `tests/engine/_helpers/` (out of scope).

## Implementation Approach
Single-file edit to `tests/engine/run-cycle.documentation.test.ts`:
1. Add `expectExactlyOne` import from `tests/helpers.ts`.
2. Add `workflowYmlNoBranch(stepsBody)` helper with `no_branch: true` on the workflow entry.
3. Add `parseLog(logStr)` local helper for JSON-line parsing.
4. Add happy-path test using `workflowYmlNoBranch()`, `expectExactlyOne` on `step.start`/`step.end`/`cycle.end`.
5. Add non-fatal-failure test using `workflowYmlNoBranch()`, `expectExactlyOne` on `documentation.skipped`/`cycle.end`.

No production code changes. All changes are additive — no existing tests are modified.

---

## Task 1: Add Imports, `workflowYmlNoBranch()` Helper, and `parseLog()` Helper

### Overview
Extend `tests/engine/run-cycle.documentation.test.ts` with the `expectExactlyOne` import and two local helpers needed by both new tests. This task has no test of its own — it's infrastructure for Tasks 2 and 3.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

**Import addition** — add `expectExactlyOne` import after existing imports:
```typescript
import { expectExactlyOne } from "../../tests/helpers.ts";
```

**New `workflowYmlNoBranch()` helper** — add after existing `workflowYml()`:
```typescript
function workflowYmlNoBranch(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    no_branch: true
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}
```

**New `parseLog()` helper** — add after `workflowYmlNoBranch()`:
```typescript
function parseLog(logStr: string): Record<string, unknown>[] {
  return logStr.trim().split("\n").map((l) => JSON.parse(l));
}
```

### Success Criteria
- [ ] `npm run typecheck` passes — no type errors from new import or helpers.
- [ ] Existing 2 tests unaffected (no changes to their code).

---

## Task 2: Add Happy-Path `no_branch` Test

### Overview
New test: `documentation` step in `no_branch: true` workflow writes `DOCUMENTATION.md`, emits `step.end status:ok`, `cycle.end status:ok`, and `step.start` for `documentation` has no `head_sha` field. Uses `expectExactlyOne` for all cardinality-pinned event assertions.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

**New test** — append after existing test at line 85:
```typescript
test("runCycle: documentation step success in no_branch workflow writes DOCUMENTATION.md; step.start has no head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nb-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nb-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlNoBranch(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");

    const summary = "Documented the no_branch workflow path.";
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\nprintf '%s' '${summary}'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-NB-1",
      title: "doc no branch happy",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-no-branch-happy`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.ok(await fileExists(docFile), `expected ${docFile}`);
    assert.equal(await readFile(docFile, "utf8"), summary + "\n");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);

    const stepStart = expectExactlyOne(events, "step.start");
    assert.equal(stepStart.head_sha, undefined, "documentation step.start must not carry head_sha");

    const stepEnd = expectExactlyOne(events, "step.end");
    assert.equal(stepEnd.status, "ok");

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

**Note on slug**: `slugify("doc no branch happy")` → `"doc-no-branch-happy"`, so `artifactDir` uses that slug. Verify against the actual `slugify` implementation if the test fails — adjust the slug literal accordingly.

### Success Criteria
- [ ] Test passes under `node --experimental-strip-types --test tests/engine/run-cycle.documentation.test.ts`.
- [ ] `DOCUMENTATION.md` assertion confirms file written with correct content.
- [ ] `expectExactlyOne(events, "step.start")` returns the event; `head_sha` is `undefined`.
- [ ] `expectExactlyOne(events, "step.end")` returns `status: "ok"`.
- [ ] `expectExactlyOne(events, "cycle.end")` returns `status: "ok"`.

---

## Task 3: Add Non-Fatal-Failure `no_branch` Test

### Overview
New test: when the `documentation` step exits non-zero in a `no_branch: true` workflow, `documentation.skipped {reason: "exec_failed"}` is emitted and `cycle.end` is still `ok` (non-fatal contract). Uses `expectExactlyOne` for cardinality-pinned assertions.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

**New test** — append after Task 2's test:
```typescript
test("runCycle: documentation step exec-failure in no_branch workflow emits documentation.skipped; cycle.end ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nb-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nb-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlNoBranch(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "boom", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho boom 1>&2\nexit 2\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-NB-2",
      title: "doc no branch fail",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);

    const skipped = expectExactlyOne(events, "documentation.skipped");
    assert.equal(skipped.reason, "exec_failed");
    assert.equal(skipped.exit_code, 2);

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-no-branch-fail`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.equal(await fileExists(docFile), false, "DOCUMENTATION.md must not be written on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test passes under `node --experimental-strip-types --test tests/engine/run-cycle.documentation.test.ts`.
- [ ] `expectExactlyOne(events, "documentation.skipped")` asserts exactly one emission with `reason: "exec_failed"` and `exit_code: 2`.
- [ ] `expectExactlyOne(events, "cycle.end")` asserts `status: "ok"` (not `"failed"`).
- [ ] `DOCUMENTATION.md` does not exist.

---

## Task 4: Full Suite Verification

### Overview
Run the complete verification sequence to confirm no regressions and all floors pass.

### Steps
```bash
# With Node 22:
nvm use 22.22.2

npm run typecheck
npm run test:coverage
# check:coverage and check:invariants run automatically after test:coverage
```

### Success Criteria
- [ ] `npm run typecheck` — 0 errors.
- [ ] All 4 tests in `run-cycle.documentation.test.ts` pass.
- [ ] Full suite passes (currently 482 tests; new count = 484).
- [ ] `npm run check:coverage` passes — no floor regression.
- [ ] `npm run check:invariants` passes — no invariant violation.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`workflowYml()\` helper (or a new variant) produces a \`no_branch: true\` workflow fixture with no \`pr\` step.` | Task 1 | New `workflowYmlNoBranch()` variant. `no_branch: true` is a no-op YAML marker (field silently ignored by parser); `mode: trunk` drives actual behavior. No `pr` step included. |
| `[ ] Happy-path sub-test: \`DOCUMENTATION.md\` written with agent stdout; \`step.end status:ok\`; \`cycle.end status:ok\`; \`step.start\` for \`documentation\` has no \`head_sha\` field.` | Task 2 | All four assertions present. |
| `[ ] Non-fatal-failure sub-test: \`documentation.skipped {reason: "exec_failed"}\` emitted; \`cycle.end status:ok\` (not \`failed\`).` | Task 3 | `expectExactlyOne` on `documentation.skipped`; `cycleEnd.status === "ok"` assertion. |
| `[ ] Both new sub-tests use \`expectExactlyOne\` for exactly-once event assertions.` | Task 2 & 3 | Happy-path: `expectExactlyOne` on `step.start`, `step.end`, `cycle.end`. Failure: `expectExactlyOne` on `documentation.skipped`, `cycle.end`. |
| `[ ] All existing tests in the file pass.` | All tasks | No existing test code modified. |
| `[ ] \`npm run test:coverage\` passes with coverage not lower than baseline.` | Task 4 | New tests add coverage; no production code removed. |
| `[ ] \`npm run check:invariants\` passes.` | Task 4 | No new structural rules needed; existing invariants unaffected. |
| `[ ] No TypeScript errors (\`npm run typecheck\`).` | Task 4 | `workflowYmlNoBranch` and `parseLog` are plain functions with inferred types; `expectExactlyOne` import is typed. |

---

## Testing Strategy

### Unit Tests
No unit tests for the helpers themselves — they're test-only utilities with trivial implementations.

### Integration / E2E Tests
All four assertions in Tasks 2 and 3 are integration tests: they call `runCycle()` against a real temp git repo with a real fake binary, and inspect real filesystem state and log output.

Key edge cases covered:
- `step.start` `head_sha` absence: confirmed via `event.head_sha === undefined`, not just falsy.
- Non-fatal failure: `r.status === "ok"` plus `cycle.end status:ok` together confirm both the return value and the log agree.
- `DOCUMENTATION.md` absent on failure: `fileExists()` assertion.

### Anti-Mock Stance
No mocking. `runCycle()` runs against real temp directories, real git repos, real shell scripts as fake `claude` binaries — same pattern as all existing documentation tests.

## Risk Assessment
- **Slug mismatch**: `slugify("doc no branch happy")` and `slugify("doc no branch fail")` must resolve to the exact slug used in `artifactDir`. If a test fails with "expected file not found", check the actual `r.cycleId` and adjust the slug literal. Mitigation: construct `artifactDir` from `r.cycleId` dynamically if the static slug literal proves fragile — but the existing tests use static slugs successfully, so this pattern is safe.
- **`expectExactlyOne` on `step.start` in multi-step workflows**: Both new tests use a single-step workflow (`documentation` only), so exactly one `step.start` is guaranteed. If steps are ever added to the fixture, the assertion would catch double-emission — which is the intended behavior.
- **No production regressions**: Zero production code changes; risk is test-only.
```
