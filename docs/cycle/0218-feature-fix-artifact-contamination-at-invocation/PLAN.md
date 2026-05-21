# Implementation Plan: Cycle 0218

## Overview

Fixes persistent artifact contamination at the invocation layer by injecting `--append-system-prompt` into the Claude CLI spawn for all artifact-producing steps (Option A), and by adding explicit WRONG/CORRECT negative examples to the six prompt FAM sections that lack them (Option B).

## Current State (from Research)

- `exec-claudecode.ts` hardcodes `argv: ["--dangerously-skip-permissions", "-p"]` with no mechanism for extra flags.
- `ExecModule.runStep` interface has `model?` and `thinking?` as the optional-field extension precedent; no `appendSystemPrompt` field exists.
- `run-cycle.ts` defines `RESET_ELIGIBLE_STEPS` and `SKIP_ELIGIBLE_STEPS` as module-scope `Set<string>` constants; no `ARTIFACT_STEPS` constant exists.
- Artifact-producing steps are: `spec`, `research`, `plan`, `build`, `review`, `fix`, `documentation` (from `workflows.yml:19-28`).
- `spec.md` has an inline negative example without WRONG/CORRECT labels (cycle 0217). The other six prompts have no negative example.
- `plan-prompt-spec-traceability.test.ts` lacks a trailing-commentary assertion for `plan.md` (gap from cycle 0217 review).
- Current baseline: 638 passing tests.
- **SPEC.md is contaminated**: The spec step produced a single confirmation sentence instead of a structured document — exactly the bug this cycle fixes. Acceptance criteria are derived from the RESEARCH cycle description.

## Desired End State

- `claudecodeExec.runStep` accepts `appendSystemPrompt?: string` and prepends `["--append-system-prompt", value]` to argv when truthy.
- `run-cycle.ts` defines `ARTIFACT_STEPS` and `ARTIFACT_SUPPRESS_PROMPT`; passes suppression text for all artifact-producing steps.
- All six prompts without a negative example contain a `**WRONG**` / `**CORRECT**` labeled block in their FAM section.
- `plan.md` gains a trailing-commentary prohibition test.
- Test suite passes at 647 tests (+9).
- `npm run typecheck` passes with zero errors.
- `.cycle/prompts/` is byte-identical to `src/defaults/prompts/` after `sync-defaults`.

## What We're NOT Doing

- Not using `--system-prompt` (replaces the default system prompt; `--append-system-prompt` layers on top without removing CLAUDE.md loading).
- Not warning when `appendSystemPrompt` is passed to non-claudecode agents (codex, gemini, auggie, opencode, pi silently ignore it — acceptable, none are used for artifact steps).
- Not normalizing `spec.md`'s inline prose example to WRONG/CORRECT format (it already has a negative example; adding a second format creates redundancy).
- Not adding structural validation to the `SPEC_MIN_BYTES` gate.
- Not testing `ARTIFACT_STEPS` membership directly (the argv-assertion tests cover the end-to-end chain; the constant is not exported).

## Implementation Approach

Follow the established optional-field extension pattern from `model?` / `thinking?` in `exec-codex.ts`: add the field to the interface, destructure and consume it in `claudecodeExec`, then wire the call site in `run-cycle.ts` with a set-membership check. Prompt edits follow the existing FAM section pattern; tests follow the established fake-binary and file-read assertion patterns.

---

## Task 1: Extend ExecModule Interface with appendSystemPrompt

### Overview

Adds `appendSystemPrompt?: string` to `ExecModule.runStep` so all exec modules can accept it. Only `claudecodeExec` will consume it; others receive and ignore it (via spread destructuring, as `codexExec` does with `model`/`thinking`).

### Changes Required

**File**: `src/engine/exec.ts`

Add one optional field after `thinking?` in the `ExecModule` interface (lines 10–17):

```typescript
export interface ExecModule {
  runStep(args: {
    repoRoot: string;
    promptPath: string;
    env?: Record<string, string>;
    model?: string;
    thinking?: string;
    appendSystemPrompt?: string;
  }): Promise<StepResult>;
}
```

No changes to REGISTRY or `resolveAgent`. The other exec modules destructure with `{ model, thinking, ...args }` — they will implicitly receive and discard `appendSystemPrompt` without modification.

### Success Criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes (no behavioral change)

---

## Task 2: Implement --append-system-prompt in claudecodeExec

### Overview

Restructures `claudecodeExec` to destructure `appendSystemPrompt` and conditionally prepend it to argv before `-p`, following the `exec-codex.ts` pattern.

### Changes Required

**File**: `src/engine/exec-claudecode.ts`

Replace the current one-liner with explicit argv construction:

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  runStep({ appendSystemPrompt, ...args }) {
    const argv: string[] = ["--dangerously-skip-permissions"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    argv.push("-p");
    return runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
  },
};
```

`-p` remains the last flag before the prompt body. `exec-spawn.ts:21` appends the prompt text after all argv elements via `[...argv, prompt]`, so flag order is preserved.

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] Existing `exec-claudecode.test.ts` tests still pass (no regression on `--dangerously-skip-permissions -p` invocation)
- [ ] `npm test` passes

---

## Task 3: Add ARTIFACT_STEPS and Wire appendSystemPrompt in run-cycle.ts

### Overview

Defines the `ARTIFACT_STEPS` constant and a fixed suppression text constant, then passes `appendSystemPrompt` conditionally at the `mod.runStep()` call site.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Step 3a** — Add constants after the existing `SKIP_ELIGIBLE_STEPS` constant (around line 33):

```typescript
const ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "documentation"]);

const ARTIFACT_SUPPRESS_PROMPT =
  "You are in File Artifact Mode for this invocation. Output only the requested document content as clean structured Markdown. Do not include insight blocks, star-marker commentary, educational explanations, contribution requests, confirmation sentences, narration, or trailing commentary. Produce the file — nothing else.";
```

**Step 3b** — At the `mod.runStep()` call site (currently line 298), pass `appendSystemPrompt` conditionally:

```typescript
const mod = resolveAgent(step.agent);
r = await mod.runStep({
  repoRoot,
  promptPath: step.prompt!,
  env: cycleEnv,
  model: step.model,
  thinking: step.thinking,
  appendSystemPrompt: ARTIFACT_STEPS.has(step.name ?? "") ? ARTIFACT_SUPPRESS_PROMPT : undefined,
});
```

`step.name ?? ""` handles the optional typing safely; empty string never matches a set member.

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `ARTIFACT_STEPS` contains exactly the seven step names from `workflows.yml:19-28` — verify by inspection

---

## Task 4: Argv-Assertion Tests for claudecodeExec

### Overview

Two new tests in `exec-claudecode.test.ts` verifying that `--append-system-prompt` appears in the argv when provided and is absent when not. These are the primary regression gate for Option A.

### Changes Required

**File**: `tests/engine/exec-claudecode.test.ts`

Append after the two existing tests:

```typescript
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
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("omits --append-system-prompt from argv when appendSystemPrompt is not provided", async () => {
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
    });
    assert.equal(r.status, "ok");
    assert.ok(!r.stdout.includes("--append-system-prompt"), "expected --append-system-prompt absent from argv");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] Both new tests pass
- [ ] Existing two tests still pass
- [ ] Test count in this file: 4

---

## Task 5: Add WRONG/CORRECT Negative Examples to 6 Prompts

### Overview

Inserts a `**WRONG**` / `**CORRECT**` labeled block into the FAM section of `plan.md`, `review.md`, `build.md`, `research.md`, `fix.md`, and `documentation.md`. Insertion point: immediately before the `If any of these appear in your output` consequence paragraph in each FAM section.

### Changes Required

Insert the following block (adapted per file) between the bullet list and the consequence paragraph:

**plan.md** — insert before `If any of these appear in your output` (around line 151):
```markdown
**WRONG** (contaminated output — do not produce this):
> Plan written to `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/PLAN.md`.
>
> This plan covers all the changes needed...

**CORRECT** (clean artifact output — produce only this):
> # Implementation Plan: Cycle 0218
```

**review.md** — insert before `If any of these appear in your output` (around line 123):
```markdown
**WRONG** (contaminated output — do not produce this):
> REVIEW.md written to `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/REVIEW.md`.
>
> Here is the review...

**CORRECT** (clean artifact output — produce only this):
> # Review: Cycle 0218 — PASS
```

**build.md** — insert before `If any of these appear in your output` (around line 80):
```markdown
**WRONG** (contaminated output — do not produce this):
> Build complete. I've implemented the changes and updated the following files...

**CORRECT** (clean artifact output — produce only this):
> ## Summary
```

**research.md** — insert before `If any of these appear in your output`:
```markdown
**WRONG** (contaminated output — do not produce this):
> Research complete. I've gathered the information needed for this cycle...

**CORRECT** (clean artifact output — produce only this):
> # Research: Cycle 0218
```

**fix.md** — insert before `If any of these appear in your output`:
```markdown
**WRONG** (contaminated output — do not produce this):
> FIX.md written to `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/FIX.md`.
>
> Here is the fix summary...

**CORRECT** (clean artifact output — produce only this):
> ## Summary
```

**documentation.md** — insert before `If any of these appear in your output`:
```markdown
**WRONG** (contaminated output — do not produce this):
> Documentation updated. I've modified ENGINE.md and ARCHITECTURE.md to reflect the changes...

**CORRECT** (clean artifact output — produce only this):
> ## Summary
```

After editing all six files, run:

```
npm run sync-defaults
```

### Success Criteria

- [ ] Each of the 6 `src/defaults/prompts/*.md` files contains `**WRONG**` in its FAM section
- [ ] `npm run sync-defaults` exits 0
- [ ] `.cycle/prompts/*.md` byte-identical to `src/defaults/prompts/*.md` (verify via `npm test` dogfood tests)

---

## Task 6: Tests for Negative Examples + plan.md Trailing-Commentary Gap

### Overview

Adds 7 tests asserting `**WRONG**` presence in the 6 updated prompts (plan, review get 1 each in `plan-prompt-spec-traceability.test.ts`; build/research/fix/documentation get 1 each in `file-artifact-mode-guardrail.test.ts`), plus the missing trailing-commentary test for `plan.md`.

### Changes Required

**File**: `tests/defaults/plan-prompt-spec-traceability.test.ts`

Add 3 tests before the dogfood byte-identity tests:

```typescript
test("plan prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in plan.md");
});

test("plan prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in plan.md FAM section");
});

test("review prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in review.md FAM section");
});
```

**File**: `tests/defaults/file-artifact-mode-guardrail.test.ts`

Add 4 tests, one after each prompt's existing 5-test block:

```typescript
test("build prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(BUILD_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in build.md FAM section");
});

test("research prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(RESEARCH_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in research.md FAM section");
});

test("fix prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(FIX_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in fix.md FAM section");
});

test("documentation prompt File Artifact Mode includes concrete negative example", async () => {
  const body = await readFile(DOC_SRC, "utf8");
  assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in documentation.md FAM section");
});
```

### Success Criteria

- [ ] All 9 new tests pass (2 exec-claudecode + 3 plan-prompt-spec-traceability + 4 file-artifact-mode-guardrail)
- [ ] No regressions in existing 638 tests
- [ ] Total: 647 tests passing
- [ ] `npm run test:coverage` passes all global and per-file coverage gates
- [ ] `npm run check:invariants` passes

---

## SPEC Acceptance Traceability

**Note**: `SPEC.md` for this cycle is contaminated — the spec step produced a one-line confirmation sentence (`"SPEC.md written to …"`) rather than a structured document with an `## Acceptance Criteria` section. This is precisely the bug being fixed. Acceptance criteria are derived from the RESEARCH cycle description and the contaminated SPEC's summary sentence, which scopes: Option A (`--append-system-prompt` via `ARTIFACT_STEPS` in `run-cycle.ts`), Option B (WRONG/CORRECT negative examples in 6 remaining prompts), and argv-assertion unit tests as the regression gate.

| Derived Acceptance Bullet | Covering Task | Notes |
|---|---|---|
| `ARTIFACT_STEPS` constant defined in `run-cycle.ts` containing the seven artifact step names | Task 3 | |
| `ExecModule.runStep` interface gains `appendSystemPrompt?: string` | Task 1 | |
| `claudecodeExec.runStep` prepends `["--append-system-prompt", value]` to argv when `appendSystemPrompt` is truthy | Task 2 | |
| `run-cycle.ts` passes `appendSystemPrompt: ARTIFACT_SUPPRESS_PROMPT` (or `undefined`) based on `ARTIFACT_STEPS.has(step.name)` | Task 3 | |
| Two argv-assertion tests: flag present when provided, absent when omitted | Task 4 | Primary regression gate per SPEC summary |
| Six prompts (`plan`, `review`, `build`, `research`, `fix`, `documentation`) each gain a WRONG/CORRECT labeled negative example in their FAM section | Task 5 | `spec.md` explicitly excluded — already has example |
| Six new tests asserting `**WRONG**` presence, one per updated prompt | Task 6 | |
| `plan.md` gains a trailing-commentary prohibition test | Task 6 | Gap from cycle 0217 review |
| `npm run sync-defaults` runs cleanly; `.cycle/prompts/` byte-identical to `src/defaults/prompts/` | Task 5 | Enforced by existing dogfood byte-identity tests |
| Full test suite passes with 647 tests (+9 from 638 baseline) | Task 6 | |
| `npm run typecheck` passes with zero errors | Tasks 1–4 | |
| Coverage gates pass: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%; per-file floors unchanged | Task 6 | |

---

## Testing Strategy

### Unit Tests

**`tests/engine/exec-claudecode.test.ts`** (+2 tests):
- Fake-binary argv assertion: `appendSystemPrompt` provided → `--append-system-prompt <text>` in stdout
- Fake-binary argv assertion: `appendSystemPrompt` absent → flag not in stdout
- Uses established fake-binary pattern from existing tests; no mocking needed

**`tests/defaults/plan-prompt-spec-traceability.test.ts`** (+3 tests):
- `plan.md` trailing-commentary prohibition
- `plan.md` `**WRONG**` presence
- `review.md` `**WRONG**` presence

**`tests/defaults/file-artifact-mode-guardrail.test.ts`** (+4 tests):
- `build.md`, `research.md`, `fix.md`, `documentation.md` `**WRONG**` presence each

All tests read files directly; no mocking required.

### Integration / E2E Tests

No full `run-cycle` integration tests added for this cycle. The argv-assertion unit tests at the exec-module boundary are the specified regression gate. The existing run-cycle test suite covers the step invocation path independently.

## Risk Assessment

- **Multi-word suppression text in argv**: Shell word-splitting could corrupt the flag. Mitigation: `exec-spawn.ts` uses `spawn` (not `exec`) with array argv — the string is passed verbatim to the OS with no shell interpretation.
- **`step.name` nullability**: Typed as optional in the `Step` interface. `ARTIFACT_STEPS.has(step.name ?? "")` safely coerces `undefined` to an empty string that never matches a set member.
- **spec.md format divergence**: `spec.md` uses inline prose for its negative example; the other six use WRONG/CORRECT labels. This divergence is intentional and documented — spec.md was updated in cycle 0217, normalization is deferred.
- **SPEC.md contamination**: The contaminated spec is itself evidence the fix is needed. Plan is derived from RESEARCH and the contaminated SPEC's summary sentence; the review step should accept this with the explicit note in the traceability section.
