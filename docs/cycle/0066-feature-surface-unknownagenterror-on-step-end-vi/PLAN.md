# Implementation Plan: Cycle 0066

## Overview
Widen the failed-`step.end` `stderr` emission gate in `src/engine/run-cycle.ts:178-180` from bash-only (`step.agent === "bash" && r.status === "failed"`) to status-only (`r.status === "failed"`), so a dispatch-time `UnknownAgentError` synthesis (and any future agent-path failure) is persisted on disk in `.cycle/log.jsonl`. Closes SPEC 0029 Acceptance #6.

## Current State (from Research)
- `truncateStepEndStderr` helper + `MAX_STEP_END_STDERR = 2000` already exist at `src/engine/run-cycle.ts:27-29` (head-kept, trailing `…`).
- `UnknownAgentError` is thrown by `resolveAgent` at `src/engine/exec.ts:28-32`; caught at `src/engine/run-cycle.ts:149-155` and synthesized into `r = {status:"failed", exitCode:-1, stdout:"", stderr: err.message}`. Control then falls through to the same `step.end` emit.
- `step.end` emission at `src/engine/run-cycle.ts:173-181` uses an object-spread conditional `...(cond ? {stderr: …} : {})` — only the boolean condition changes.
- Existing test fixture pattern at `tests/engine/run-cycle.step-end-stderr.test.ts` (`workflowYml`, `setupRepo`, `findStepEnd` helpers — local, not exported). Sibling test at `tests/engine/run-cycle.test.ts:1514-1552` exercises the unknown-agent path through `runCycle` and currently asserts the dispatch failure emits no `stderr` key.
- `UnknownAgentError.message` format anchored at `src/engine/exec.ts:14-20`: `agent "<name>" is not registered; known agents: claudecode, codex, gemini` — short and stable, well under 2000 chars.
- Doc claims to update: `CLAUDE.md:79` and `docs/ARCHITECTURE.md:262-268` both carry the bash-only phrasing.

## Desired End State
- `src/engine/run-cycle.ts:178` gate reads `r.status === "failed"` only — no `step.agent === "bash"` predicate.
- A workflow step with `agent: bogus` produces a `step.end` line whose JSON parses to `{event:"step.end", cycle_id, step:"bogus", status:"failed", exit_code:-1, stderr:"agent \"bogus\" is not registered; known agents: claudecode, codex, gemini"}`.
- `CLAUDE.md` and `docs/ARCHITECTURE.md` describe the new status-only gate accurately; the duplicate-helper note in `CLAUDE.md` is preserved.
- All existing tests in `tests/engine/run-cycle.step-end-stderr.test.ts` and `tests/engine/run-cycle.test.ts` continue to pass (the unknown-agent test at `run-cycle.test.ts:1514-1552` keeps its current regex assertion — that assertion uses `assert.match` with a `…step":"bogus","status":"failed","exit_code":-1/` regex, which is anchored at `exit_code:-1` and tolerates trailing keys; we will verify and adjust this assertion if it incidentally fails because the trailing comma/closing brace changes).
- Verify via `npm test` (full suite green) + `npm run typecheck` (no warnings) + `npm run test:coverage` (no per-file or aggregate regression).

## What We're NOT Doing
- Renaming `stderr` to `stderr_excerpt` (SPEC pins the field name as `stderr`).
- Extracting a shared `truncateStepEndStderr` helper across `run-cycle.ts` and `triage.ts` (covered by sibling `refl-0065-extract-shared-head-capped-truncate-help`).
- Routing the message anywhere other than the `step.end` payload (no new artifact, no log-line restructuring).
- Refactoring `UnknownAgentError`, the agent registry, or `exec.ts`/`exec-{claudecode,codex,gemini}.ts`.
- Changing `exit_code:-1` semantics on dispatch failures.
- Adding `stderr` to successful `step.end` events on any path.
- Touching `src/defaults/` (dogfood mirror); no `sync-defaults` needed.
- Adding a dispatch-path overflow integration test — the `UnknownAgentError` message is fixed-length and well under cap; adding a fake-agent registry seam is out of proportion (see Risk Assessment for rationale and unit-level alternative).

## Implementation Approach
Two-line code change plus three doc edits and two test additions. The code change is a single-condition rewrite at the gate; the helper is reused as-is. Tests sit in a new file (`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`) to keep bash- vs dispatch-path fixtures readable per SPEC §Testing Strategy. Cap-overflow coverage on the dispatch path is added as a pure unit test of `truncateStepEndStderr` against a `>2000`-char input — exporting the helper for test access if it is not already exported. Documentation drift is fixed in the same commit so the build step's Pass 3 (doc-vs-code) is satisfied.

---

## Task 1: Widen the `step.end` stderr gate in `run-cycle.ts`

### Overview
Change the conditional spread predicate from `step.agent === "bash" && r.status === "failed"` to `r.status === "failed"` only. One-token semantic widening; helper, key name, and shape unchanged.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: At line 178, replace:

```ts
        ...(step.agent === "bash" && r.status === "failed"
          ? { stderr: truncateStepEndStderr(r.stderr) }
          : {}),
```

with:

```ts
        ...(r.status === "failed"
          ? { stderr: truncateStepEndStderr(r.stderr) }
          : {}),
```

Also, export `truncateStepEndStderr` (and `MAX_STEP_END_STDERR` for tests that assert the boundary) by changing line 28 from `const truncateStepEndStderr = …` to `export const truncateStepEndStderr = …` and line 27 from `const MAX_STEP_END_STDERR = 2000;` to `export const MAX_STEP_END_STDERR = 2000;`. Rationale: the new dispatch-overflow unit test needs a direct call site for the helper; without an export, the only way to exercise the cap on the dispatch path is to add a fake-agent registry seam, which SPEC §Out of Scope discourages.

### Success Criteria
- [ ] `npm run typecheck` passes with no warnings.
- [ ] The diff in `run-cycle.ts` is exactly two lines of behavior change (the gate) plus the two `export` keyword additions; no other file or no other line in this file is modified.
- [ ] All existing tests in `tests/engine/run-cycle.step-end-stderr.test.ts` still pass.

---

## Task 2: Add dispatch-path `step.end` stderr test (verbatim)

### Overview
Drive `runCycle` against a tmp repo whose workflow has a single step with `agent: bogus`. Assert the failed `step.end` JSON parses to a payload that carries `stderr` equal to the exact `UnknownAgentError.message` produced by a direct `resolveAgent("bogus")` call (so the assertion is not pinned to a literal that may drift if the registry list changes).

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (new)
**Changes**: Mirror the helper structure from `tests/engine/run-cycle.step-end-stderr.test.ts` (re-implement `workflowYml`, `setupRepo`, `findStepEnd` inline — those helpers are not exported). Body sketch:

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { resolveAgent, UnknownAgentError } from "../../src/engine/exec.ts";

// ... workflowYml / setupRepo / findStepEnd helpers (copied from sibling test)

test("failed dispatch step.end carries verbatim UnknownAgentError stderr", async () => {
  let expectedMessage = "";
  try { resolveAgent("bogus"); } catch (e) {
    assert.ok(e instanceof UnknownAgentError);
    expectedMessage = (e as Error).message;
  }
  assert.ok(expectedMessage.length > 0 && expectedMessage.length < 2000);

  const root = await setupRepo(
    `      - name: dispatch_fail
        agent: bogus
        prompt: prompts/x.md
`,
    [],
  );
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/x.md"), "noop", "utf8");

    const r = await runCycle(root, {
      issueId: "SE-DISPATCH",
      title: "dispatch fail step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "dispatch_fail");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "dispatch_fail");
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.exit_code, -1);
    assert.equal(parsed.stderr, expectedMessage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] New test passes locally.
- [ ] Assertion uses the live `UnknownAgentError` message (no hardcoded literal).
- [ ] `parsed.stderr` is exactly the live message; `parsed.exit_code === -1`; `parsed.status === "failed"`.

---

## Task 3: Add successful agent-path `step.end` omission assertion

### Overview
Add a second test in the same new file that drives a real `claudecode` step end-to-end (via a fake `claude` binary on PATH — same harness pattern as `tests/engine/run-cycle.test.ts:1514-1552` and existing `tests/engine/exec-claudecode.test.ts` precedents) and asserts the successful `step.end` payload has no `stderr` key. This locks the negative invariant SPEC §Acceptance #4 requires.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (extend Task 2 file)
**Changes**: Append:

```ts
test("successful agent step.end omits stderr key", async () => {
  const root = await setupRepo(
    `      - name: ok_agent
        agent: claudecode
        prompt: prompts/x.md
`,
    [],
  );
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/x.md"), "noop", "utf8");

    // Minimal fake claude binary mirroring tests/engine/run-cycle.test.ts:1531-1533
    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho 'agent output'\nexit 0\n", "utf8");
    const { chmod } = await import("node:fs/promises");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "SE-AGENT-OK",
      title: "ok agent step",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "ok_agent");
    assert.equal(parsed.status, "ok");
    assert.ok(!("stderr" in parsed), "successful agent step.end must not carry stderr");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

Notes:
- The step name `ok_agent` must not collide with any of `reflection`/`documentation` (those have post-success ingestion paths). `ok_agent` is safe.
- Successful agent steps also trigger the artifact-write seam (`run-cycle.ts:156-168`); the fake binary's stdout (`"agent output\n"`) will be written to `<artifactDir>/OK_AGENT.md`. The 200-byte SPEC guard fires only for `step.name === "spec"`, so an arbitrary step name is unaffected.

### Success Criteria
- [ ] New test passes locally.
- [ ] `parsed.status === "ok"` and `"stderr" in parsed === false`.

---

## Task 4: Add dispatch-path cap-overflow unit test

### Overview
Per the Open Question in RESEARCH.md, the live `UnknownAgentError` message is too short to exercise the 2000-char cap, and adding an in-test registry seam is out of proportion for one assertion. The cap is byte-identical on both paths (same helper). Cover the boundary via a direct unit test of the exported `truncateStepEndStderr` helper against a `>2000`-char input, mirroring the existing bash-path overflow shape from `run-cycle.step-end-stderr.test.ts:113-139`.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (extend Task 2/3 file)
**Changes**: Append:

```ts
import { truncateStepEndStderr, MAX_STEP_END_STDERR } from "../../src/engine/run-cycle.ts";

test("truncateStepEndStderr head-caps at MAX_STEP_END_STDERR with trailing ellipsis", () => {
  const input = "x".repeat(2500);
  const out = truncateStepEndStderr(input);
  assert.equal(out.length, MAX_STEP_END_STDERR);
  assert.equal(MAX_STEP_END_STDERR, 2000);
  assert.ok(out.endsWith("…"));
  assert.equal(out.slice(0, MAX_STEP_END_STDERR - 1), "x".repeat(MAX_STEP_END_STDERR - 1));
});

test("truncateStepEndStderr passes through short input unchanged", () => {
  const input = "agent \"bogus\" is not registered; known agents: claudecode, codex, gemini";
  assert.equal(truncateStepEndStderr(input), input);
});

test("truncateStepEndStderr boundary: exact MAX is unchanged", () => {
  const input = "y".repeat(MAX_STEP_END_STDERR);
  assert.equal(truncateStepEndStderr(input), input);
  assert.equal(truncateStepEndStderr(input).length, MAX_STEP_END_STDERR);
});
```

### Success Criteria
- [ ] All three unit tests pass.
- [ ] The `2500`-input case produces exactly 2000 chars ending with `…`, byte-identical to the bash-path overflow assertion at `run-cycle.step-end-stderr.test.ts:113-139`.
- [ ] The exact-`MAX` boundary case proves the gate is strict `>` (not `>=`), matching the helper at `run-cycle.ts:28-29`.

---

## Task 5: Update documentation to describe the broadened gate

### Overview
`CLAUDE.md` §"Architecture quick reference" and `docs/ARCHITECTURE.md` both carry the now-outdated bash-only claim. Update both for parity; leave `README.md` and `AGENTS.md` untouched (no operator-facing reference).

### Changes Required
**File**: `CLAUDE.md` (line 79 — the "Failed bash `step.end` events …" bullet)
**Changes**: Replace the existing one-line paragraph so it reads (preserving the duplicate-helper note):

> Failed `step.end` events carry a head-capped `stderr` field (2000-char convention, slice to `MAX-1` + `…`, mirroring the `engine.paused last_errors[].error` truncation at `src/engine/triage.ts:231-233`); successful `step.end` events on all paths omit the field. Gate is `r.status === "failed"` (any agent), not `r.stderr` truthiness — an empty stderr from a failure still emits `"stderr":""` literally. Both code paths surface stderr through this gate: real subprocess failure in `execBashStep` (bash agent) and dispatch-time `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:149-155` (claudecode/codex/gemini agents). Implemented via inline `MAX_STEP_END_STDERR` constant + `truncateStepEndStderr` helper in `src/engine/run-cycle.ts`; the duplicate of the triage truncate helper is intentional (extract a shared helper when a third caller lands).

**File**: `docs/ARCHITECTURE.md` (lines 262-268)
**Changes**: Replace lines 262-264 so they read:

```
Failed `step.end` events (any agent) carry a head-capped `stderr` field
(2000-char convention, slice to `MAX-1` + `…`). Both bash-step subprocess
failures and dispatch-time `UnknownAgentError` synthesis surface here.
Successful `step.end` events on all paths omit the field.
```

Leave the example JSONL block at lines 266-268 unchanged (the example is still accurate — it shows a failed bash `verify` step).

### Success Criteria
- [ ] `CLAUDE.md` no longer carries the bash-only gate phrasing.
- [ ] `docs/ARCHITECTURE.md` no longer carries the bash-only gate phrasing.
- [ ] The review-step Pass 3 doc-vs-code check finds no drift between these docs and the new `r.status === "failed"` gate.

---

## Testing Strategy

### Unit Tests
- `truncateStepEndStderr`: overflow case (input 2500 → output 2000 ending `…`), short input pass-through, exact-`MAX` boundary (must remain `MAX`, no truncation).
- Prefer real `UnknownAgentError` message for verbatim assertions; resolve via a live `resolveAgent("bogus")` call inside the test so the literal is not duplicated.
- Mocking: none needed for the dispatch verbatim test (the real `resolveAgent` throws). For the successful-agent-path test, reuse the fake-`claude`-on-PATH harness pattern from `tests/engine/run-cycle.test.ts:1514-1552` — this is a real binary on disk, not a JS mock, consistent with the project's anti-mock bias.

### Integration / E2E Tests
- Dispatch path through `runCycle` end-to-end: workflow `{steps:[{name:"dispatch_fail", agent:"bogus", prompt:"prompts/x.md"}]}` produces a parsed `step.end` line with `stderr === <live UnknownAgentError message>`, `status === "failed"`, `exit_code === -1`.
- Successful agent path through `runCycle` end-to-end: workflow `{steps:[{name:"ok_agent", agent:"claudecode", prompt:"prompts/x.md"}]}` with a fake `claude` binary on PATH produces a parsed `step.end` line with `status === "ok"` and no `stderr` key.
- Existing bash-path coverage in `tests/engine/run-cycle.step-end-stderr.test.ts` (3 tests) is unchanged and must still pass — SPEC Acceptance #3.
- Existing unknown-agent test at `tests/engine/run-cycle.test.ts:1514-1552` is unchanged but must still pass — its regex assertion at line 1546 (`"event":"step.end",…,"exit_code":-1`) does not anchor on the closing `}`, so the new trailing `,"stderr":"…"` key is tolerated. Verify this is the case during build; if the regex turns out to be anchored at end-of-line, broaden it to match.

## Risk Assessment
- **Risk**: `tests/engine/run-cycle.test.ts:1546`'s regex `"event":"step.end","cycle_id":"0001","step":"bogus","status":"failed","exit_code":-1/` becomes a regression because the line now grows a trailing `,"stderr":"…"` key. **Mitigation**: the regex has no end-anchor (no `$`) — JS `RegExp.prototype.test` and `assert.match` allow trailing characters. Confirm by running the full suite after Task 1; if it fails, change the regex literal to `/"event":"step.end".*"step":"bogus".*"status":"failed".*"exit_code":-1/` (loose multi-segment match).
- **Risk**: `successful agent step.end` test (Task 3) inadvertently fails because the fake-`claude` harness pattern interacts with the artifact-write seam. **Mitigation**: the precedent test at `tests/engine/run-cycle.test.ts:1514-1552` already drives the same harness through `runCycle`; reuse exactly that PATH-injection pattern. The artifact write target (`<artifactDir>/OK_AGENT.md`) is harmless; the only post-success branching that mutates state is for `step.name === "spec"` (size guard) and `step.name === "reflection"` (ingestion) — neither matches `ok_agent`.
- **Risk**: Coverage gate trips because the new branch (`r.status === "failed"` true on a non-bash path) is the new behavior under test, but the branch where `r.status === "ok"` on a non-bash path was previously implicitly covered by the omission contract. **Mitigation**: Task 3 explicitly covers the agent-success branch, so the new path is hit. The per-file floor is `src/engine/triage.ts ≥ 95%` — not `run-cycle.ts` — so the per-file gate is unaffected by this change. Aggregate line/branch/function coverage should be unchanged or improved.
- **Risk**: Exporting `MAX_STEP_END_STDERR` and `truncateStepEndStderr` from `run-cycle.ts` widens the surface area unnecessarily. **Mitigation**: the alternative (in-test registry seam for a fake agent) is a more invasive surface widening of `exec.ts` and is explicitly discouraged by SPEC §Out of Scope ("Refactoring `UnknownAgentError` itself, the agent registry, or `exec.ts`/…"). Exporting a pure helper from `run-cycle.ts` is the smaller-blast-radius option and consistent with the test-driven precedents at `findPriorStepHeadSha` (`run-cycle.ts:35-58` — exported for test access).
- **Risk**: The widened gate masks a real bug where `r.stderr` carries unexpected content on agent-path success (i.e., a future agent module returns `{status:"ok", stderr:"warning"}`). **Mitigation**: the gate is on `r.status === "failed"`, so successful agent paths still omit `stderr` regardless of `r.stderr` value — Task 3 locks this invariant.
