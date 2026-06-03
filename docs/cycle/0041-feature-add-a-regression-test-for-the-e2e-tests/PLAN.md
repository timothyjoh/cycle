# Implementation Plan: Cycle 0041

## Overview
Add one regression test to `tests/engine/noop-resolution.test.ts` that drives the **`e2e-tests`** workflow (a non-`feature` workflow) through a `research` step which exits 0 and writes a valid `NOOP.md`, asserting the cycle short-circuits to `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }` before `test_plan`/`test_build`/`review` ever start. This converts the prose-only cross-workflow guarantee in CLAUDE.md / `docs/ENGINE.md` into an executable assertion.

## Current State (from Research)
- The research-phase no-op short-circuit is name-keyed on `step.name === "research"` with **no workflow check** (`src/engine/run-cycle.ts:773-795`); the shared consumer emits `cycle.noop` then `cycle.end {status:"noop"}` and returns `{ status:"noop", reason, detectedAtStep }` (`:852-870`). Workflow lookup is by name with no enum (`:341-342`) — any name in `workflows.yml` is accepted.
- All existing research-phase short-circuit tests in `tests/engine/noop-resolution.test.ts` drive **only** the `feature` workflow. The multi-step builders `multiWorkflowYml(steps)` / `setupMultiRepo(fakeBody, steps)` (`:82-123`) **hardcode `name: feature` at `:100`**; only the step list is parameterized.
- The canonical happy-path research test (`:138-190`) is the direct template: it cardinality-pins `cycle.noop` with `filter(...).length === 1`, asserts `detected_at_step === "research"`, asserts `cycle.noop` precedes `cycle.end{noop}`, asserts research `step.end ok` exactly once, asserts **no `step.start`** for each downstream step, and asserts zero `step.completion_check { status:"fail" }`.
- `researchNoopFake(reason)` (`:128-136`) writes a valid `NOOP.md` (`reason: <reason>` + `## Evidence` + a `file.ext:line` line) plus a non-empty `## Doc` body so the `"nonempty"` completion-proof for `research` passes. `NOOP.md` is deliberately not in `STEP_ARTIFACTS`.
- Real `e2e-tests` workflow steps: `research`, `test_plan`, `test_build`, `review`, `fix`, `verify` (`src/defaults/workflows.yml:64-73`).

## Desired End State
`tests/engine/noop-resolution.test.ts` contains a new test that constructs an `e2e-tests` workflow (steps `research`, `test_plan`, `test_build`, `review`), runs it through `runCycle`, and asserts the research short-circuit. `npm test`, `npm run typecheck`, and `npm run check:coverage` all pass; `src/engine/run-cycle.ts` stays at or above its 90% floor; existing `feature`-driven tests pass byte-for-byte unchanged. A re-introduced `feature`-only gate on research-phase no-op detection turns the new test red.

Verify: `npm test` (new test passes; all existing pass); `npm run typecheck` clean; `npm run check:coverage` clean.

## What We're NOT Doing
- No change to engine source (`src/engine/run-cycle.ts`, `src/engine/noop-marker.ts`, `src/cli.ts`) — the behavior under test already ships.
- No coverage of the build-phase (LATE) no-op fallback, the `fix`-step no-op, or the `noopDrain` issue-lifecycle path — already covered.
- No change to CLAUDE.md / `docs/ENGINE.md` prose (already correct).
- Not including `fix`/`verify` in the test workflow fixture — downstream steps never execute on the short-circuit, so the minimal `research`/`test_plan`/`test_build`/`review` set is sufficient and matches the SPEC requirement ("at least `test_plan`/`test_build`/`review`").
- Not adding a `bash` step (`verify`) to the fixture — the fake `claude` agent satisfies all four declared steps and downstream steps never run.

## Implementation Approach
Resolve the RESEARCH open questions by:
1. **Generalize, don't fork.** Add an optional `name` parameter (defaulting to `"feature"`) to `multiWorkflowYml` and `setupMultiRepo`, so every existing caller (which passes only `steps`) is byte-for-byte unchanged, while the new test passes `name: "e2e-tests"`. This avoids a duplicate sibling builder and keeps one workflow-emitter code path.
2. **Step set.** Use `["research", "test_plan", "test_build", "review"]` — the minimal set satisfying the SPEC's "`research` + at least `test_plan`/`test_build`/`review`". `fix`/`verify` add no signal because no downstream step runs on the short-circuit.
3. **Reuse `researchNoopFake`** verbatim — it writes a valid `NOOP.md` + non-empty `RESEARCH.md` body and is workflow-agnostic.
4. **Clone the canonical happy-path test** (`:138-190`), changing `workflow: "feature"` → `workflow: "e2e-tests"`, the issue id, and the downstream-absence step list to `["test_plan", "test_build", "review"]`.

This is a single vertical slice: a generalized helper plus one new test, both delivered and verified together.

## Failure & Resilience Decisions
- **Helper generalization (`multiWorkflowYml`/`setupMultiRepo` name param)**: N/A — pure string-building / test-fixture setup with no production failure surface. The added parameter defaults to `"feature"`, so existing callers cannot regress. Idempotency: each `setupMultiRepo` call creates a fresh `mkdtemp` repo+bin and is torn down in `finally`; re-runs use new temp dirs. Observability: not applicable to a test helper; assertion failures surface via `node:test`.
- **New test body**: The test's failure surface *is* its assertions. Failure modes the test guards against — research no-op resolves to anything other than `noop` (continues into `test_plan`/`test_build`/`review`), or `cycle.noop` not firing exactly once — must produce a clear assertion failure, never a vacuous pass. No `runCycle` error is swallowed (the test does not wrap `runCycle` in a try/catch that hides errors; the `try/finally` only runs `cleanup`, and any `runCycle` rejection propagates to fail the test). No existence-only checks: `cycle.noop` is cardinality-pinned with `filter(...).length === 1` per the test-conventions rule. No silent failure: every assertion carries a message; the suite exits non-zero on any failure. Idempotency: temp repos are isolated per run and cleaned up in `finally`.

---

## Task 1: Generalize the multi-step workflow builders to accept a workflow name

### Overview
Add an optional `name` parameter (default `"feature"`) to `multiWorkflowYml` and `setupMultiRepo` so the same builders can emit a non-`feature` workflow without changing any existing caller.

### Changes Required
**File**: `tests/engine/noop-resolution.test.ts`

**Changes**:
- Update `multiWorkflowYml` signature and the hardcoded workflow-name line (`:100`):

```ts
function multiWorkflowYml(steps: string[], name: string = "feature"): string {
  const stepLines = steps.flatMap(s => [
    `      - name: ${s}`,
    "        agent: claudecode",
    `        prompt: prompts/${s}.md`,
  ]);
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
    "  commit:",
    "    mode: trunk",
    "    push: false",
    "triage:",
    "  agent: claudecode",
    "  prompt: prompts/triage.md",
    "  max_turns: 10",
    "workflows:",
    `  - name: ${name}`,
    "    max_cycle_attempts: 3",
    "    steps:",
    ...stepLines,
  ].join("\n") + "\n";
}
```

- Thread the name through `setupMultiRepo`:

```ts
async function setupMultiRepo(
  fakeBody: string,
  steps: string[],
  name: string = "feature",
): Promise<{ root: string; bin: string }> {
  // ...unchanged setup...
  await writeFile(join(root, ".cycle/workflows.yml"), multiWorkflowYml(steps, name), "utf8");
  // ...unchanged remainder...
}
```

All existing callers pass only `(fakeBody, steps)`, so they default to `"feature"` and emit identical YAML.

### Success Criteria
- [ ] `npm run typecheck` clean (default-valued param is optional; existing call sites still type-check).
- [ ] Existing `feature`-driven tests in `noop-resolution.test.ts` pass unchanged (the emitted YAML for default calls is byte-for-byte identical).
- [ ] Failure paths behave as designed — N/A — pure helper; no error swallowed.

---

## Task 2: Add the `e2e-tests` research-phase short-circuit regression test

### Overview
Add a new test that drives the `e2e-tests` workflow through a `research` step writing a valid `NOOP.md`, asserting the cycle short-circuits to `noop` at the research phase and that `test_plan`/`test_build`/`review` never start.

### Changes Required
**File**: `tests/engine/noop-resolution.test.ts`

**Changes**: Add a new `test(...)` block (modeled on `:138-190`), placed adjacent to the canonical research happy-path test:

```ts
test("noop-resolution: e2e-tests research exit 0 + valid NOOP.md ⇒ cycle.noop before test_plan/test_build/review", async () => {
  const { root, bin } = await setupMultiRepo(
    researchNoopFake("already-satisfied"),
    ["research", "test_plan", "test_build", "review"],
    "e2e-tests",
  );
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-E2E-RESEARCH",
      title: "noop e2e research",
      workflow: "e2e-tests",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "noop");
    assert.equal(r.status === "noop" ? r.reason : null, "already-satisfied");
    assert.equal(r.status === "noop" ? r.detectedAtStep : null, "research");

    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const noop = events.filter(e => e.event === "cycle.noop");
    assert.equal(noop.length, 1, "cycle.noop must fire exactly once (e2e-tests)");
    assert.equal(noop[0].issue_id, "NOOP-E2E-RESEARCH");
    assert.equal(noop[0].reason, "already-satisfied");
    assert.equal(noop[0].detected_at_step, "research");

    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "noop").length, 1);
    const noopIdx = events.findIndex(e => e.event === "cycle.noop");
    const endIdx = events.findIndex(e => e.event === "cycle.end" && e.status === "noop");
    assert.ok(noopIdx < endIdx, "cycle.noop precedes cycle.end{noop}");

    assert.equal(
      events.filter(e => e.event === "step.end" && e.step === "research" && e.status === "ok").length,
      1,
      "step.end research ok exactly once",
    );
    // Short-circuit: no downstream e2e-tests step ever started.
    for (const downstream of ["test_plan", "test_build", "review"]) {
      assert.equal(
        events.filter(e => e.event === "step.start" && e.step === downstream).length,
        0,
        `no step.start for ${downstream} on an e2e-tests research short-circuit`,
      );
    }
    assert.equal(events.filter(e => e.event === "step.completion_check" && e.status === "fail").length, 0);
    assert.equal(events.filter(e => e.event === "cycle.checkout").length, 1);
    assert.equal(events.filter(e => e.event === "cycle.base_pull").length, 1);
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "failed").length, 0);
  } finally {
    await cleanup(root, bin);
  }
});
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm test` auto-builds via `pretest`).
- [ ] New test passes.
- [ ] `r.status === "noop"`, `r.reason === "already-satisfied"`, `r.detectedAtStep === "research"`.
- [ ] `cycle.noop` cardinality-pinned to exactly 1; `detected_at_step === "research"`; precedes `cycle.end{noop}`.
- [ ] Zero `step.start` events for `test_plan`/`test_build`/`review`; zero failing completion checks; zero failed `cycle.end`.
- [ ] Failure paths behave as designed — assertions are sensitive to a downstream step running and to `cycle.noop` not firing exactly once; no `runCycle` error swallowed (only `cleanup` runs in `finally`).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `tests/engine/noop-resolution.test.ts` contains a new test that constructs an `e2e-tests` workflow (steps include `research` followed by at least `test_plan`/`test_build`/`review`) and runs it through `runCycle`. | Task 1, Task 2 | Helper generalized in Task 1; test added in Task 2 with steps `research`/`test_plan`/`test_build`/`review`. |
| [ ] **User-observable benefit**: running `npm test` exercises and passes a case proving the research-phase no-op short-circuit works for a non-`feature` workflow — the documented cross-workflow guarantee is now verified by the suite, not only by prose. | Task 2 | New `e2e-tests` test runs under `npm test`. |
| [ ] The test asserts `events.filter(e => e.event === "cycle.noop").length === 1` and that the matched event has `detected_at_step: "research"`. | Task 2 | `noop.length === 1` + `noop[0].detected_at_step === "research"`. |
| [ ] The test asserts a `cycle.end` event with `status: "noop"` fires, and that the `cycle.noop` event precedes it in emission order. | Task 2 | `cycle.end{noop}` count === 1 + `noopIdx < endIdx`. |
| [ ] The test asserts that no execution event for `test_plan`, `test_build`, or `review` is emitted (the cycle short-circuits before those steps run). | Task 2 | `step.start` count === 0 for each downstream step. |
| [ ] The fake agent's `NOOP.md` uses a recognized `reason:` category plus ≥1 `file.ext:line` evidence line, and the test does not establish any empty-diff condition before the research step. | Task 2 | Reuses `researchNoopFake("already-satisfied")` (valid reason + `src/engine/run-cycle.ts:678` evidence line); no empty-diff setup. |
| [ ] **Failure-path criterion**: if the engine is mutated so research-phase no-op detection is gated to `feature` only (so the `e2e-tests` marker is ignored and the cycle proceeds past `research`), this test fails — verified by the assertions above being sensitive to a `test_plan`/`test_build`/`review` step running and to `cycle.noop` not firing exactly once. | Task 2 | Downstream `step.start === 0` and `cycle.noop` exactly-once assertions both flip red under a `feature`-only gate. |
| [ ] All existing tests still pass (`npm test`). | Task 1, Task 2 | Helper default `"feature"` preserves existing callers byte-for-byte. |
| [ ] `npm run check:coverage` passes; `src/engine/run-cycle.ts` stays at or above its 90% floor and overall coverage does not decrease. | Task 2 | Test-only addition exercises an already-covered path; coverage cannot decrease. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | Optional default-valued param keeps existing call sites typed; new test uses existing typed APIs. |

---

## Testing Strategy

### Unit Tests
- The deliverable **is** a test. Key scenario: `e2e-tests` `research` exits 0 + valid `NOOP.md` ⇒ `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }`, `runCycle` returns `status: "noop"`.
- Failure-path coverage embedded in the assertions: a re-introduced `feature`-only gate would cause `test_plan`/`test_build`/`review` `step.start` events to fire (assertion count `=== 0` fails) and `cycle.noop` to not fire exactly once (assertion `length === 1` fails) — the test is the fail-loud guard.
- Exactly-once: `cycle.noop` cardinality-pinned with `filter(...).length === 1` per the test-conventions rule.
- Mocking strategy: anti-mock by construction — real temp git repos via `spawnSync("git", …)`, a real fake `claude` shell binary on a temp PATH (`CYCLE_BASE` env), direct `runCycle` invocation, real `.cycle/log.jsonl` parsing. No mocking of `runCycle` or the marker classifier.

### Integration / E2E Tests
- `runCycle` is exercised end-to-end against a real on-disk repo and real workflow YAML; this is itself the integration test. No additional E2E/browser tests required (no UI surface).

## Risk Assessment
- **Helper change accidentally regresses existing `feature` callers**: mitigated by a default parameter value of `"feature"` so default-call YAML is byte-for-byte identical; verified by running the full existing suite (`npm test`).
- **Fixture step names not declared in prompts dir**: `setupMultiRepo` writes a prompt file for every step in `steps`, so all four declared steps have prompt files; downstream steps never execute regardless. No risk.
- **Coverage regression**: the test adds coverage to an already-covered path and changes no source; `src/engine/run-cycle.ts` cannot drop below its 90% floor from a test-only addition. Verified via `npm run check:coverage`.
- **Vacuous pass if `runCycle` errored silently**: mitigated because `runCycle` errors propagate out of the test (the `finally` only runs `cleanup`), and the `r.status === "noop"` assertion fails on any non-noop outcome.
