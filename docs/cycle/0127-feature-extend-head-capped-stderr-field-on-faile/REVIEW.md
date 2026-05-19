Permissions are blocking writes to the cycle docs directory. Let me output both documents directly so the engine/user can capture them.

---

# Review: Cycle 0127

## Overall Verdict

NEEDS-FIX — 5 of 9 acceptance criteria unmet; three integration tests never written; ENGINE.md stderr section not updated; BUILD.md absent.

NEEDS-FIX triggers: AC-1/AC-2/AC-3 tests missing, AC-5 ENGINE.md update missing, AC-6 BUILD.md absent.

---

## Code Quality Review

### Summary

The builder was blocked by file-write permissions and wrote only a cosmetic patch: the `workflowYml` helper in the existing test file gained `commit: mode: trunk, push: false`. Everything else — the three integration tests, the ENGINE.md "Failed step.end stderr" section update, and BUILD.md — was left unwritten. Production code is correct and untouched (gate is already universal on master). The cycle did not deliver its test and doc requirements.

### Findings

1. **Missing tests (AC-1)**: Spec guard failure integration test not appended to `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`. File has 5 tests; PLAN requires 8.
2. **Missing tests (AC-2)**: Provider non-zero exit integration test not present — `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`.
3. **Missing tests (AC-3)**: Over-2000-byte agent-path truncation integration test not present — `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`.
4. **Missing import**: `SPEC_MIN_BYTES` not imported at `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:7–11`. Required for AC-1 assertion.
5. **ENGINE.md not updated (AC-5)**: `docs/ENGINE.md:82` still reads original two-sentence version — does not enumerate the three emission sites, does not confirm gate is universal. Required replacement text is fully specified in PLAN.md Task 2.
6. **BUILD.md absent (AC-6)**: `docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md` does not exist. No coverage numbers recorded; `refl-0029` subsumption not cited.

### Spec Compliance Checklist

- [ ] **AC-1**: Spec guard failure test — NOT implemented
- [ ] **AC-2**: Provider non-zero exit test — NOT implemented
- [ ] **AC-3**: Over-2000-byte agent-path truncation test — NOT implemented
- [x] **AC-4**: "successful agent step.end omits stderr key" continues to pass (458/458 tests pass)
- [ ] **AC-5**: ENGINE.md § "Failed step.end stderr" updated — NOT done; `docs/ENGINE.md:82` unchanged
- [ ] **AC-6**: BUILD.md cites `refl-0029` — NOT done; BUILD.md absent
- [x] All existing tests pass — 458/458
- [x] Coverage no regression — Line 98.36%, Branch 92.18%, Function 95.79% (src/); run-cycle.ts Line 100%, Branch 97.98%
- [x] No typecheck warnings

---

## Adversarial Test Review

### Summary

Existing 5 tests are solid. Integration tests use genuine end-to-end `runCycle` with real fake binaries on PATH — no mock abuse. Unit tests for `truncateStepEndStderr` have tight boundary coverage. Gap is purely the three missing integration tests.

### Findings

1. **Three tests missing (AC-1/2/3)**: spec guard, provider non-zero, over-2000-byte scenarios untested end-to-end. These are the entire purpose of this cycle.
2. **AC-1 assertion strategy note**: PLAN.md asserts `parsed.stderr.includes(String(SPEC_MIN_BYTES))` — adequate but fragile if `formatSpecGuardError` phrasing changes. Asserting `parsed.stderr.length > 0` is a safe alternative; fix step may choose either.
3. **AC-2 assertion strong**: `assert.equal(parsed.stderr, "agent failed: detail\n")` — exact. Good.
4. **AC-3 assertion strong**: length check + `endsWith("…")` — exact. `printf '%2500s' | tr ' ' 'x'` portable on macOS/Linux.

### Test Coverage

- Command run: `node --test --experimental-strip-types --experimental-test-coverage`
- Line / branch / function (src/ aggregate): **98.36% / 92.18% / 95.79%**
- `src/engine/run-cycle.ts`: **100.00% line / 97.98% branch / 100.00% function**
- Per-file floor regressions: none
- New code without tests: none
- Scenarios missing tests: AC-1, AC-2, AC-3 (all three are the cycle's deliverable)

---

## Doc-vs-Code Claim Verification

Diff touches `docs/ENGINE.md` — in scope for Pass 3. New "Engine-managed commit lifecycle" section verified:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `cycle.checkout status:skipped reason:"trunk"` | `docs/ENGINE.md:~119` | `src/engine/run-cycle.ts:269` | OK |
| `cycle.base_pull` skipped only on checkout failure | `docs/ENGINE.md:~120` | `src/engine/run-cycle.ts:281–282` | OK |
| `DENYLIST_PREFIXES = [".claude", "dist", "node_modules"]` | `docs/ENGINE.md:~104` | `src/engine/commit-cycle.ts:14` | OK |
| `DENYLIST_EXACT = [".cycle/cycle.pid"]` | `docs/ENGINE.md:~104` | `src/engine/commit-cycle.ts:15` | OK |
| 3× backoff retry 1s/2s/4s | `docs/ENGINE.md:~99` | `src/engine/commit-cycle.ts:204–209` | OK |
| `parseTouchedFiles` / `scopeGuard` in commit-cycle.ts | `docs/ENGINE.md:~112` | `src/engine/commit-cycle.ts:27,47` | OK |
| `buildClosesBlock(issueId, repoRoot)` | `docs/ENGINE.md:~107` | `src/engine/commit-cycle.ts:137` | OK |
| commit subject `cycle <id>: <title>` | `docs/ENGINE.md:~96` | `src/engine/commit-cycle.ts:191` | OK |
| `prepareTrunkArtifactDir` | `docs/ENGINE.md:~95` | `src/engine/run-cycle.ts:115,122` | OK |
| `commit_failed` / `push_failed` / `skipped` shapes | `docs/ENGINE.md:~101` | `src/engine/commit-cycle.ts:10–11,188,197,212` | OK |
| trunk/local-only skip hard-reset (`cfg.engine.commit.mode`) | `docs/ENGINE.md:~56` | `src/engine/run-cycle.ts:181` | OK |

No unbacked claims. The REQUIRED update to `docs/ENGINE.md:82` was not made — AC-5 violation (Pass 1), not a doc-vs-code issue.

---

---

# Must-Fix Items: Cycle 0127

## Summary

5 critical issues: 3 missing integration tests (AC-1/2/3), 1 missing ENGINE.md section update (AC-5), 1 missing BUILD.md (AC-6).

## Tasks

- [ ] ### Task 1: Add AC-1 integration test — spec guard failure

  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`
  **Problem:** No test verifies that a `spec`-named step with a fake `claude` binary that exits 0 with stdout < `SPEC_MIN_BYTES` emits `step.end` with `status: "failed"` and a non-empty `stderr`. File currently has 5 tests; 8 required.
  **Fix:**
  1. Extend the import at lines 7–11 to add `SPEC_MIN_BYTES`:
     ```typescript
     import {
       runCycle,
       truncateStepEndStderr,
       MAX_STEP_END_STDERR,
       SPEC_MIN_BYTES,
     } from "../../src/engine/run-cycle.ts";
     ```
  2. Append after line 134 (after the `"successful agent step.end omits stderr key"` test, before the unit tests):
     ```typescript
     test("spec post-condition guard failure emits stderr from formatSpecGuardError", async () => {
       const root = await setupRepo(
         `      - name: spec\n        agent: claudecode\n        prompt: prompts/spec.md\n`,
       );
       const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
       try {
         await mkdir(join(root, ".cycle/prompts"), { recursive: true });
         await writeFile(join(root, ".cycle/prompts/spec.md"), "noop", "utf8");
         const fake = join(bin, "claude");
         await writeFile(fake, "#!/bin/bash\necho 'hi'\nexit 0\n", "utf8");
         await chmod(fake, 0o755);
         const r = await runCycle(root, {
           issueId: "SE-SPEC-GUARD",
           title: "spec guard test",
           workflow: "feature",
           env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
         });
         assert.equal(r.status, "failed");
         assert.equal(r.failingStep, "spec");
         const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
         const parsed = findStepEnd(log, "spec");
         assert.equal(parsed.status, "failed");
         assert.ok("stderr" in parsed, "spec guard step.end must carry stderr");
         assert.ok(typeof parsed.stderr === "string" && parsed.stderr.length > 0, "stderr must be non-empty");
       } finally {
         await rm(root, { recursive: true, force: true });
         await rm(bin, { recursive: true, force: true });
       }
     });
     ```
  **Verify:** `node --test --experimental-strip-types tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` shows 6 pass. Grep `"spec guard"` in the output.

- [ ] ### Task 2: Add AC-2 integration test — provider non-zero exit

  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`
  **Problem:** No test verifies that a fake `claude` binary exiting non-zero with stderr output causes `step.end` to carry that stderr verbatim.
  **Fix:** Append after Task 1's test (still before the unit tests):
  ```typescript
  test("provider non-zero exit carries verbatim stderr on step.end", async () => {
    const root = await setupRepo(
      `      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n`,
    );
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      await mkdir(join(root, ".cycle/prompts"), { recursive: true });
      await writeFile(join(root, ".cycle/prompts/build.md"), "noop", "utf8");
      const fake = join(bin, "claude");
      await writeFile(fake, "#!/bin/bash\nprintf 'agent failed: detail\\n' >&2\nexit 1\n", "utf8");
      await chmod(fake, 0o755);
      const r = await runCycle(root, {
        issueId: "SE-NONZERO",
        title: "provider nonzero test",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "failed");
      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const parsed = findStepEnd(log, "build");
      assert.equal(parsed.status, "failed");
      assert.equal(parsed.stderr, "agent failed: detail\n");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `node --test --experimental-strip-types tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` shows 7 pass. Check `"provider non-zero"` in output.

- [ ] ### Task 3: Add AC-3 integration test — over-2000-byte agent-path truncation

  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`
  **Problem:** No end-to-end test verifies that a fake binary emitting 2500 bytes to stderr produces a `step.end.stderr` of exactly 2000 chars ending in `…`.
  **Fix:** Append after Task 2's test (still before the unit tests):
  ```typescript
  test("over-2000-byte agent stderr is head-capped at MAX_STEP_END_STDERR with trailing ellipsis", async () => {
    const root = await setupRepo(
      `      - name: flood\n        agent: claudecode\n        prompt: prompts/flood.md\n`,
    );
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      await mkdir(join(root, ".cycle/prompts"), { recursive: true });
      await writeFile(join(root, ".cycle/prompts/flood.md"), "noop", "utf8");
      const fake = join(bin, "claude");
      await writeFile(fake, "#!/bin/bash\nprintf '%2500s' | tr ' ' 'x' >&2\nexit 1\n", "utf8");
      await chmod(fake, 0o755);
      const r = await runCycle(root, {
        issueId: "SE-FLOOD",
        title: "agent flood test",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "failed");
      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const parsed = findStepEnd(log, "flood");
      assert.equal(parsed.status, "failed");
      assert.ok("stderr" in parsed, "flood step.end must carry stderr");
      assert.equal((parsed.stderr as string).length, MAX_STEP_END_STDERR);
      assert.ok((parsed.stderr as string).endsWith("…"), "truncated stderr must end with ellipsis");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `node --test --experimental-strip-types tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` shows 8 pass. Check `"over-2000-byte"` in output. Then `npm test` (via correct Node): 461 pass.

- [ ] ### Task 4: Update ENGINE.md § "Failed step.end stderr" (AC-5)

  **Priority:** Critical
  **Files:** `docs/ENGINE.md`
  **Problem:** Line 82 still reads the original two-sentence version. Does not enumerate the three emission sites; does not state the gate is universal across all agents.
  **Fix:** Replace line 82 exactly. Current text:
  ```
  Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"`, not `r.stderr` truthiness.
  ```
  Replace with:
  ```
  Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"` across all agents, not `r.stderr` truthiness. Three emission sites set `r.stderr` before the gate fires: (1) `UnknownAgentError` during dispatch (`run-cycle.ts:~219`) — error message verbatim; (2) spec post-condition guard (`run-cycle.ts:~231`) — `formatSpecGuardError(path, bytes, SPEC_MIN_BYTES)`; (3) provider-module non-zero exit in `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts` — captured stderr stream, head-capped at 2000 chars.
  ```
  **Verify:** `grep -n "across all agents" docs/ENGINE.md` returns line 82. `grep -n "exec-claudecode\|exec-codex\|exec-gemini" docs/ENGINE.md` returns at least one hit in the stderr section.

- [ ] ### Task 5: Create BUILD.md with coverage numbers and refl-0029 citation (AC-6)

  **Priority:** Critical
  **Files:** `docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md`
  **Problem:** File does not exist. AC-6 requires BUILD.md to cite `refl-0029-spec-acceptance-bullet-6-deferred-to-wro` and record actual coverage numbers.
  **Fix:** After Tasks 1–3 pass and coverage runs clean, create the file with:
  ```markdown
  # Build Notes: Cycle 0127

  ## What Was Done

  Appended three integration tests to `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`
  covering AC-1 (spec guard failure), AC-2 (provider non-zero exit), and AC-3 (over-2000-byte
  truncation). Updated `docs/ENGINE.md` § "Failed step.end stderr" to enumerate all three
  emission sites. Added `SPEC_MIN_BYTES` to the import line.

  ## Coverage

  | Metric | Result | Baseline |
  |--------|--------|----------|
  | Line (src/) | 98.36% | ≥95% |
  | Branch (src/) | 92.18% | ≥75% |
  | Function (src/) | 95.79% | ≥90% |

  `src/engine/run-cycle.ts`: Line 100.00%, Branch 97.98%, Function 100.00%. No regression.

  ## refl-0029 Subsumption

  `docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` is already in
  `done/`. That raw's intent — surface `UnknownAgentError` via the `step.end` dispatch path — is
  now pinned by AC-1's regression test in this cycle. No additional work required.

  ## Touched Files

  - tests/engine/run-cycle.step-end-stderr-dispatch.test.ts
  - docs/ENGINE.md
  - docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md
  ```
  **Verify:** `ls docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md` returns the file. `grep "refl-0029" docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md` returns the subsumption sentence.
