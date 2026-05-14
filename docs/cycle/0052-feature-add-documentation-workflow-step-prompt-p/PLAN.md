Have full context. Resolving open questions inline, then writing PLAN.md to stdout.

Open question resolutions:
1. **Inline `||` vs `Set`**: inline `||` — matches existing one-line style at `run-cycle.ts:154`, smaller diff, SPEC explicitly defers generalization to Out of Scope.
2. **Prompt forbids JSON-wrapper / fences**: yes, per SPEC Requirements #1 ("No markdown fences, no JSON wrapper, no preamble") — mirror reflection.md's Discipline section but flip JSON→prose.
3. **`exit_code` field naming**: confirmed `exit_code` matches `reflection.skipped` shape at `run-cycle.ts:155`.
4. **`e2e-tests` parity**: no test asserts step-count parity across workflows; reflection-test file uses inlined one-step workflows.

```markdown
# Implementation Plan: Cycle 0052

## Overview

Append non-fatal `documentation` step to `feature` workflow (after `reflection`). Engine captures stdout to `<artifactDir>/DOCUMENTATION.md` via existing generic path; failures emit `documentation.skipped {reason: "exec_failed", exit_code}` and let `cycle.end status:ok` fire. Closes doc-drift loop inside the cycle that produced the drift.

## Current State (from Research)

- `src/engine/run-cycle.ts:145-147` already writes `<STEP_NAME_UPPER>.md` generically for any `claudecode` step with `r.status === "ok"`. `DOCUMENTATION.md` slots in for free.
- `src/engine/run-cycle.ts:153-159` has the only non-fatal terminal branch today (`step.name === "reflection"`). Extend by replacing the strict-equality check with `step.name === "reflection" || step.name === "documentation"` and emit a distinct `documentation.skipped` event with the SAME `{cycle_id, reason: "exec_failed", exit_code}` shape as the reflection event (confirmed at `run-cycle.ts:155`).
- `src/engine/workflow.ts:5-11` already accepts arbitrary `name` + `prompt`; no schema change.
- `src/engine/exec.ts:22` already registers `claudecode`; no agent change.
- `src/defaults/workflows.yml:24` ends `feature` at `reflection`. `.cycle/workflows.yml:30` does the same in trunk-based mode with a divergence comment at lines 11-16 that MUST be preserved.
- `tests/engine/run-cycle.reflection.test.ts:143-182` is the template for the documentation non-fatal-failure test (claude-shim approach, fake `bin/claude` that `exit 1`s).
- Reflection prompt at `src/defaults/prompts/reflection.md` is the structural template: input enumeration, stdout-only contract, Discipline section, Bad-output example. Documentation prompt diverges in three ways: emits prose paragraph (not JSON), permits `Edit` of drifted docs in place, restricts write scope to `README.md` + `docs/**/*.md` excluding `docs/cycle/*`.

## Desired End State

After this cycle:

- Running `cycle run --workflow feature` on either the shipped default or this repo's dogfooded workflow performs a `documentation` step after `reflection`.
- Successful run produces `docs/cycle/<cycle_id>-feature-<slug>/DOCUMENTATION.md` containing the agent's one-paragraph summary; drifted docs are edited in place under `README.md` / `docs/**/*.md` (excluding `docs/cycle/*`).
- Failed run emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` to `.cycle/log.jsonl`, then `cycle.end status:ok`. No `DOCUMENTATION.md` file written.
- `CLAUDE.md` Architecture quick reference contains a `Documentation step:` paragraph immediately after the existing `Reflection step:` paragraph.
- `npm test` passes (≥ 343 + 2 new tests). `npm run typecheck` clean. `npm run test:coverage` ≥ master baseline (line 95% / branch 75% / func 90%); `src/engine/triage.ts` line ≥ 95% unaffected (no triage edits).

Verification:
- `node --test tests/engine/run-cycle.documentation.test.ts` — both new tests green.
- `grep -A1 'name: reflection' src/defaults/workflows.yml` shows `documentation` as the next entry.
- `diff src/defaults/prompts/documentation.md .cycle/prompts/documentation.md` — empty (synced).
- `grep 'Documentation step:' CLAUDE.md` returns one match.

## What We're NOT Doing

- NOT introducing a workflow-level `fatal: false` field. The non-fatal set stays hard-coded in `run-cycle.ts` (`reflection`, `documentation`); SPEC defers generalization explicitly until a third post-PR step demands it.
- NOT adding `documentation` to the `e2e-tests` workflow. SPEC §Out of Scope — that workflow has no PR / no upstream-merged code change, so the non-fatal rationale does not apply.
- NOT building a custom test-suite documentation reporter — SPEC §Out of Scope; filed as a separate raw issue later.
- NOT generating API reference from source, NOT translating docs.
- NOT touching `src/engine/reflection.ts` or `ingestReflection` — documentation has NO equivalent ingest hook; generic stdout capture is the entire artifact mechanism.
- NOT adding `documentation` to `RESET_ELIGIBLE_STEPS` (`run-cycle.ts:22`). The step is read-mostly + Edit-in-place; idempotent via stdout overwrite; not branch-mutating in any way that requires reset (matches the `reflection` policy at CLAUDE.md line 75).
- NOT updating `README.md` in this cycle — first real run of the new step will surface any user-facing doc drift (cycle is its own dogfooding agent).
- NOT changing the non-fatal-step detection to a `Set` constant — inline `||` matches existing style and produces the smaller diff.

## Implementation Approach

Five small slices, each independently verifiable:

1. **Default workflow yaml** — append step to `src/defaults/workflows.yml`. Smallest possible change; no code; just a YAML line.
2. **Prompt file** — create `src/defaults/prompts/documentation.md` modeled on `reflection.md`'s shape.
3. **Engine non-fatal branch** — extend the `if (step.name === "reflection")` guard at `run-cycle.ts:154` to include `documentation` and emit the distinct event name.
4. **Tests** — add `tests/engine/run-cycle.documentation.test.ts` with two scenarios (happy path + non-fatal failure). Existing reflection tests act as the regression guard.
5. **Sync + dogfood + docs** — `npm run sync-defaults` (copies the new prompt only; `.cycle/workflows.yml` divergence guard kicks in, no clobber), hand-edit `.cycle/workflows.yml` to add the same step preserving the divergence comment, update `CLAUDE.md` Architecture section with the one-paragraph entry.

Order matters: slice 3 (engine change) must precede slice 4 (tests) because the test asserts the new event name. Slice 1+2 can land in either order. Slice 5 is a finishing pass.

---

## Task 1: Append `documentation` step to shipped default workflow

### Overview

Add `documentation` as the 10th-and-final step of the `feature` workflow in `src/defaults/workflows.yml` so downstream consumers pick it up via `cycle init`.

### Changes Required

**File**: `src/defaults/workflows.yml`

**Change**: After the line `- { name: reflection, agent: claudecode, prompt: prompts/reflection.md }` (currently line 24), append one new line:

```yaml
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

Preserve column alignment with the surrounding entries. The `e2e-tests` workflow (lines 26-37) is NOT modified.

### Success Criteria

- [ ] `src/defaults/workflows.yml` parses as valid YAML (verified implicitly by `loadWorkflow` during test runs).
- [ ] `documentation` is the last entry in the `feature` workflow `steps:` list.
- [ ] `e2e-tests` workflow unchanged.

---

## Task 2: Create `src/defaults/prompts/documentation.md`

### Overview

Author the prompt the `claudecode` agent consumes during the `documentation` step. Mirror `src/defaults/prompts/reflection.md`'s structural discipline (input enumeration, output contract, bad-output example) but flip the contract from JSON to a single short prose paragraph and add edit-in-place doc-write guidance.

### Changes Required

**File**: `src/defaults/prompts/documentation.md` (new file)

**Contents** (full file):

```markdown
# Documentation Agent

You are the documentation step of the cycle engine. Your job is to keep
project docs in sync with the code change that just shipped. Read the
diff, edit any drifted docs in place, then emit a one-paragraph summary
on **stdout**. No markdown fences, no JSON wrapper, no preamble.

## Inputs to read

The cycle artifact directory is the current working directory. Read
whichever of these files exist:

- `SPEC.md` — what we set out to build.
- `BUILD.md` — what was actually built.
- `REVIEW.md` — review findings.
- `FIX.md` (may be absent) — fixes applied after review.

Then inspect the shipped diff and current doc set:

- `git diff "${CYCLE_BASE}"...HEAD` — the actual code change.
- `CLAUDE.md` — project conventions.
- `README.md` — user-facing entry point.
- `docs/**/*.md` — all project docs EXCEPT `docs/cycle/*` (that subtree
  is cycle artifacts, not product docs — never touch it).

## What to edit

Update docs that the diff has made stale or incomplete. Examples:

- A command's flags changed → update its row in the `Commands` table.
- A new event name was introduced → mention it where its sibling events
  are documented.
- An invariant changed → update the paragraph that asserted the old one.
- A file path moved → update references.

Discipline:

- Prefer `Edit` over `Write`. Do NOT create new doc files unless
  absolutely necessary.
- NEVER touch `docs/cycle/*` — that is cycle-artifact storage.
- Keep edits minimal and surgical. Match surrounding tone and formatting.
- If a doc is silent on a topic but the diff suggests it should mention
  one, add the smallest sentence that closes the gap.

## Output contract

Emit a single short paragraph on stdout describing what you changed
(file paths + one-clause-per-file is ideal). Example:

```
Updated CLAUDE.md Architecture quick reference with the new `documentation` step entry. Added `documentation.skipped` event to the engine event vocabulary table in docs/ARCHITECTURE.md.
```

If no doc updates are warranted, emit exactly this sentence and nothing
else:

```
No documentation updates required for this cycle.
```

### Discipline

- Plain prose. No markdown fences around your stdout. No JSON wrapper.
- No leading `Here is the summary:`, no trailing `Hope this helps!`.
- The engine captures stdout verbatim to `DOCUMENTATION.md` — keep it tight.

### Bad output (rejected)

Do NOT do this:

````
Here is the documentation summary:

```
Updated README.md and CLAUDE.md.
```

Let me know if you'd like me to revise.
````

Plain paragraph only.
```

### Success Criteria

- [ ] File exists at `src/defaults/prompts/documentation.md`.
- [ ] Mentions the four required inputs (`git diff`, `BUILD.md`, `REVIEW.md`, optionally `FIX.md`) and the read-list (`CLAUDE.md`, `README.md`, `docs/**/*.md`).
- [ ] Forbids editing under `docs/cycle/*` and instructs `Edit` over `Write`.
- [ ] Specifies plain-paragraph stdout shape and the literal no-op sentence.

---

## Task 3: Extend non-fatal-step branch in `runCycle`

### Overview

Update `src/engine/run-cycle.ts` so a `documentation` step failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` and continues the loop instead of returning `failed`. Keep the existing `reflection.skipped` branch behaviorally identical (regression guard).

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Current code** (lines 153-160):

```ts
      if (r.status === "failed") {
        if (step.name === "reflection") {
          await log.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, status: "failed" as const, failingStep: step.name };
      }
```

**New code**:

```ts
      if (r.status === "failed") {
        if (step.name === "reflection") {
          await log.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        if (step.name === "documentation") {
          await log.emit("documentation.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, status: "failed" as const, failingStep: step.name };
      }
```

Rationale for two separate `if` blocks instead of a combined `||` + dynamic event name: keeps the event-name string a literal at the call site (greppable via `git grep '"documentation.skipped"'`), matches the existing `reflection.skipped` shape exactly, and avoids template-literal indirection for two values. SPEC explicitly defers generalization.

No other edits to `run-cycle.ts`:
- Generic stdout-capture path at line 146 already writes `DOCUMENTATION.md` on success.
- `RESET_ELIGIBLE_STEPS` at line 22 is NOT extended — documentation is read-mostly + idempotent.
- `findPriorStepHeadSha` / restart logic untouched.

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] Existing reflection tests still pass (`tests/engine/run-cycle.reflection.test.ts`, all 4 tests).
- [ ] New documentation tests (Task 4) pass.

---

## Task 4: Add `tests/engine/run-cycle.documentation.test.ts`

### Overview

Add two tests modeled on `tests/engine/run-cycle.reflection.test.ts:47-101` (happy path) and `tests/engine/run-cycle.reflection.test.ts:143-182` (non-fatal failure). Use the same `mkdtemp` + fake `bin/claude` shim pattern. Inline a one-step workflow so the test isolates the documentation branch.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts` (new file)

**Contents** (full file):

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
}

test("runCycle: documentation step success writes DOCUMENTATION.md verbatim", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");

    const summary = "Updated README.md to mention the new flag.";
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\nprintf '%s' '${summary}'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-1",
      title: "doc happy",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    // artifactDir is docs/cycle/<cycleId>-feature-<slug>/
    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-happy`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.ok(await fileExists(docFile), `expected ${docFile}`);
    assert.equal(await readFile(docFile, "utf8"), summary);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"documentation.skipped"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step exit-non-zero is non-fatal; cycle.end ok; documentation.skipped emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
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
      issueId: "DOC-2",
      title: "doc fail",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"documentation.skipped".*"reason":"exec_failed".*"exit_code":2/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);

    // No DOCUMENTATION.md on failure (stdout-capture gated on r.status === "ok").
    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-fail`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.equal(await fileExists(docFile), false, "DOCUMENTATION.md must not be written on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

Anti-mock note: tests spawn a real shell-script `claude` shim via PATH — same pattern as every other engine test. No `mock`/`stub` of `runStep` directly.

### Success Criteria

- [ ] Both tests pass with `npm test`.
- [ ] `npm run test:coverage` shows the new `documentation.skipped` branch covered; aggregate line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] Existing 4 reflection tests still green (regression guard).

---

## Task 5: Sync defaults, hand-edit `.cycle/workflows.yml`, update CLAUDE.md

### Overview

Three small finishing edits to make the change dogfood-active and documented.

### Changes Required

**Step 5a — Sync the new prompt**:

```sh
npm run sync-defaults
```

This copies `src/defaults/prompts/documentation.md` → `.cycle/prompts/documentation.md`. The divergence guard at `scripts/sync-defaults.mjs:13-22` will SKIP `.cycle/workflows.yml` (it's the canonical divergent file) and copy the rest normally. Expected stderr: `skipped .cycle/workflows.yml — locally divergent` plus `1 path(s) skipped`. Exit code `2` is the documented success-with-skip path. **Confirm** the new `.cycle/prompts/documentation.md` was created.

**Step 5b — Hand-edit `.cycle/workflows.yml`**:

After the line `- { name: reflection, agent: claudecode, prompt: prompts/reflection.md }` (currently line 30), append:

```yaml
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

Preserve the divergence comment at lines 11-16 untouched. The trunk-based `feature` workflow keeps `no_branch: true` and the `commit-trunk.sh`-not-`pr` shape — only the new terminal step is added.

**Step 5c — Update CLAUDE.md Architecture quick reference**:

**File**: `CLAUDE.md`

After the existing `Reflection step:` paragraph (currently at line 73, ending with `…"refl-<cycleId>-parse-error.md"`), insert a new bullet at the same indentation level:

```markdown
- Documentation step: `src/engine/run-cycle.ts` treats `documentation` as non-fatal terminal (same shape as `reflection`). Prompt at `src/defaults/prompts/documentation.md` instructs the agent to read `git diff ${CYCLE_BASE}...HEAD`, `BUILD.md`, `REVIEW.md` (+ optional `FIX.md`), edit drifted docs in place under `README.md` and `docs/**/*.md` (excluding `docs/cycle/*`), and emit a one-paragraph summary captured to `DOCUMENTATION.md`. Failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` but does not flip `cycle.end` to `failed` (the code change has already merged upstream via `pr` or `commit-trunk.sh`).
```

### Success Criteria

- [ ] `.cycle/prompts/documentation.md` exists and is byte-identical to `src/defaults/prompts/documentation.md`.
- [ ] `.cycle/workflows.yml` ends `feature` with the `documentation` step and preserves the divergence comment.
- [ ] `CLAUDE.md` contains one `Documentation step:` paragraph immediately after `Reflection step:`.
- [ ] `npm test` still green (this slice is doc/config only, no code change).

---

## Testing Strategy

### Unit Tests

- Happy path: documentation agent returns `{status:"ok", stdout:"<summary>"}` → `DOCUMENTATION.md` contains the summary verbatim; no `documentation.skipped` event in log; `cycle.end status:ok`.
- Non-fatal failure: documentation agent exits non-zero → exactly one `documentation.skipped {reason:"exec_failed", exit_code:N}`; `cycle.end status:ok`; no `DOCUMENTATION.md` file.
- **Mocking strategy**: zero mocks of internal functions. Use the shell-script `bin/claude` shim that the existing reflection tests use (`tests/engine/run-cycle.reflection.test.ts:68-70`). Real `runStep`, real `spawn`, real file IO under `mkdtemp`. Anti-mock bias satisfied.

### Integration / E2E Tests

- Regression guard: existing `tests/engine/run-cycle.reflection.test.ts` (all 4 tests) must remain green. Confirms the new `documentation` branch did NOT subsume / alter the reflection path.
- Coverage gate: `npm run test:coverage` enforces aggregate floors via the `posttest:coverage` hook. The new `documentation.skipped` branch in `run-cycle.ts` MUST be covered by Task 4's failure test; otherwise branch coverage will dip.

### Manual smoke (optional, not gating)

Running `cycle run --workflow feature` end-to-end would exercise the new step against the real `claude` binary — out of scope for the test suite, but worth doing once the first real cycle after this lands.

## Risk Assessment

- **Risk**: Test asserts artifact-dir path of the form `docs/cycle/<cycleId>-feature-<slug>/` but the engine may name it differently. **Mitigation**: Cross-checked against `tests/engine/run-cycle.reflection.test.ts:80` (`refl-${r.cycleId}-hidden-coupling.md` lives at `docs/cycle/issues/raw/`, not the artifact dir — different code path). The artifact-dir path comes from `prepareTrunkArtifactDir` / `createCycleBranch` in `src/engine/branch.ts`; slugify lowercases + kebabs the title (`slugify` from `src/issue/id.ts`). Both tests use lowercase-kebab titles (`doc happy` → `doc-happy`, `doc fail` → `doc-fail`) so the assertion stays simple. If the slug or dir convention differs, the test will fail fast with a clear `expected … to exist` message and the assertion can be relaxed to a glob.

- **Risk**: `npm run sync-defaults` may behave unexpectedly because the new prompt path has no prior sha entry. **Mitigation**: New paths are the normal-copy fast path in `scripts/sync-defaults.mjs` — only existing divergent destinations are guarded. The new prompt file will copy and record a fresh sha in `.cycle/.sync-state.json`.

- **Risk**: Adding `documentation` to the engine-internal non-fatal set creates a third post-step in the future that someone fails to add to the set, silently flipping a cycle to `failed`. **Mitigation**: SPEC explicitly defers generalization. Document the policy in CLAUDE.md (Task 5c does this) so the convention is greppable for the next contributor.

- **Risk**: Prompt-file size or wording induces the agent to JSON-wrap or fence its output (parallel to reflection's parse-error path). **Mitigation**: The prompt's Discipline section and Bad-output example explicitly reject fences/JSON; on failure the engine still captures stdout to `DOCUMENTATION.md` verbatim (no JSON.parse step, unlike reflection.ts) — worst case is a slightly noisy `DOCUMENTATION.md`, not a parse error. No second repair pass needed.

- **Risk**: `documentation` step on a cycle whose diff is doc-only (e.g., this very cycle once it lands) loops on edits. **Mitigation**: The prompt's no-op sentence (`No documentation updates required for this cycle.`) is the documented escape hatch. Future iteration may add a `git diff --stat` gate, but that's out of scope here.
```

Plan written to stdout — engine will capture to `PLAN.md`. Five vertical slices, each independently testable, total touch under ~100 LoC outside tests.
