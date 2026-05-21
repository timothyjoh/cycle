# Implementation Plan: Cycle 0223

## Overview

Add an argv-ordering assertion to the existing `--append-system-prompt` presence test in `tests/engine/exec-claudecode.test.ts`, asserting that `--append-system-prompt` appears before `-p` in the spawned argv. No production code changes.

## Current State (from Research)

- `tests/engine/exec-claudecode.test.ts` has 4 tests; the target is the test at line 49 ("includes --append-system-prompt in argv when appendSystemPrompt is provided").
- The stub binary outputs `ARGS --dangerously-skip-permissions --append-system-prompt suppress-learning-mode -p Write a spec.` to stdout.
- Existing assertions (lines 68–69) use `assert.ok(r.stdout.includes(...))` — string presence only, no ordering.
- The file uses `import { strict as assert } from "node:assert"` throughout; no `lessThan` helper exists. Correct form is `assert.ok(a < b, "msg")`.
- The absence test at line 76 is out of scope per SPEC.

## Desired End State

`tests/engine/exec-claudecode.test.ts` line ~70 contains:
```ts
const argv = r.stdout.trim().split(/\s+/);
assert.ok(
  argv.indexOf("--append-system-prompt") < argv.indexOf("-p"),
  "--append-system-prompt must precede -p in argv"
);
```
`npm test` passes with all 659+ tests green. Coverage does not decrease.

## What We're NOT Doing

- No changes to any file in `src/`.
- No new test cases — one additive assertion on one existing test.
- No ordering assertions on other flags (`--model`, `--thinking`, `--dangerously-skip-permissions`).
- No changes to the absence test at line 76.
- No changes to stub binary construction.

## Implementation Approach

Parse `r.stdout` into a token array via `trim().split(/\s+/)`, then call `indexOf` on the array. The leading `"ARGS"` token does not affect correctness: `"ARGS" !== "--append-system-prompt"` and `"ARGS" !== "-p"`, so indexOf returns the correct positions regardless. No need to slice. Use `assert.ok(a < b, "msg")` consistent with the file's existing assertion style.

---

## Task 1: Add ordering assertion to the presence test

### Overview

Insert two lines after the existing presence assertions in the "includes --append-system-prompt in argv" test: one to parse stdout into a token array, one to assert ordering via `assert.ok`.

### Changes Required

**File**: `tests/engine/exec-claudecode.test.ts`

Insert after line 69 (after the two existing `assert.ok` presence assertions):

```ts
    const argv = r.stdout.trim().split(/\s+/);
    assert.ok(
      argv.indexOf("--append-system-prompt") < argv.indexOf("-p"),
      "--append-system-prompt must precede -p in argv"
    );
```

Full test block after change (lines 49–74):

```ts
test("includes --append-system-prompt in argv when appendSystemPrompt is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "Write a spec.", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("claudecode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      appendSystemPrompt: "suppress-learning-mode",
    });
    assert.equal(r.status, "ok");
    assert.ok(r.stdout.includes("--append-system-prompt"), "expected --append-system-prompt in argv");
    assert.ok(r.stdout.includes("suppress-learning-mode"), "expected suppression text in argv");
    const argv = r.stdout.trim().split(/\s+/);
    assert.ok(
      argv.indexOf("--append-system-prompt") < argv.indexOf("-p"),
      "--append-system-prompt must precede -p in argv"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] `tests/engine/exec-claudecode.test.ts` contains `argv.indexOf("--append-system-prompt") < argv.indexOf("-p")`.
- [ ] No other test in the file is modified.
- [ ] `npm test` exits 0 with all tests passing.
- [ ] `npm run test:coverage` exits 0 with no coverage regression (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`tests/engine/exec-claudecode.test.ts\` contains \`indexOf('--append-system-prompt')\` compared via \`lessThan\` (or \`<\`) to \`indexOf('-p')\` in the test that checks presence of \`--append-system-prompt\`.` | Task 1 | Uses `assert.ok(a < b)` — consistent with file style; no `lessThan` helper in `node:assert` |
| `[ ] The "omits --append-system-prompt" test is unchanged (no ordering assertion needed when flag is absent).` | Task 1 | Absence test at line 76 is explicitly not touched |
| `[ ] \`npm test\` exits 0 with all tests passing.` | Task 1 | Verified in success criteria |
| `[ ] \`npm run test:coverage\` exits 0 with no coverage regression vs. baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).` | Task 1 | Additive assertion; no new branches; coverage cannot decrease |

---

## Testing Strategy

### Unit Tests

- The modified test IS the test: the ordering assertion runs within the existing `node:test` harness.
- No mocking — real temp dirs, real stub binary, real spawn.
- Edge case already handled: prompt body tokens after `-p` do not affect `indexOf("--append-system-prompt")` or `indexOf("-p")` positions.

### Integration / E2E Tests

- `npm test` runs the full 659-test suite; any regression surfaces immediately.

## Risk Assessment

- **`-p` appears multiple times in argv**: `exec-claudecode.ts` pushes `-p` exactly once (line 8); stub echoes it once. `indexOf` returns first occurrence — safe.
- **Prompt body contains `-p`**: stub body is `"Write a spec."` — no `-p` token. Not a concern for this test.
- **Assertion added to wrong test**: Only the presence test (line 49) is modified; the absence test (line 76) is untouched. Reviewers should verify the diff touches exactly one test.
