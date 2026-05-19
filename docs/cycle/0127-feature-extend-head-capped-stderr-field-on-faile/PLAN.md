Now I have all context needed. Writing the plan.

```markdown
# Implementation Plan: Cycle 0127

## Overview

Add three regression tests for agent-path `step.end` stderr emission (spec guard, provider non-zero exit, over-2000-byte truncation) deferred from cycle 0065, and update `docs/ENGINE.md` § "Failed step.end stderr" to enumerate all three emission sites.

## Current State (from Research)

- **Production gate already universal**: `run-cycle.ts:239–246` spreads `stderr` on `r.status === "failed"` for all agents — no code change needed.
- **Three emission sites**: (1) `UnknownAgentError` dispatch catch at `:212–218`, (2) spec post-condition guard at `:222–233`, (3) provider `close` handler in `exec-claudecode/codex/gemini.ts`.
- **Exports available**: `SPEC_MIN_BYTES` (200), `MAX_STEP_END_STDERR` (2000), `truncateStepEndStderr`, `formatSpecGuardError` all exported from `run-cycle.ts:47–55`.
- **Existing test file**: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (155 lines) — has `workflowYml`, `setupRepo`, `findStepEnd` helpers and two integration tests + three unit tests. Append-only.
- **Patterns locked**: fake binary via `mkdtemp` + bash script + `chmod 0o755` + `PATH: \`${bin}:...\`` in env; prompt file required at `.cycle/prompts/<name>.md`; `CYCLE_BASE: "main"` always in env; `rm` both root and bin in `finally`.
- **ENGINE.md**: lines 80–82 describe the 2000-char cap but do not list emission sites and do not explicitly remove bash-only qualification.
- **`refl-0029`**: `docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` exists — BUILD.md needs one sentence citing it.

## Desired End State

- `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` has 8 tests (5 existing + 3 new): spec guard failure, provider non-zero verbatim, over-2000-byte truncation.
- `docs/ENGINE.md` § "Failed step.end stderr" enumerates all three emission sites and states gate as `r.status === "failed"` across all agents.
- `BUILD.md` exists with coverage numbers and a sentence subsuming `refl-0029`.
- All 8 ACs pass; `npm test` green; coverage does not regress.

## What We're NOT Doing

- Changing the `stderr` field name (stays `stderr`).
- Changing `MAX_STEP_END_STDERR` (stays 2000).
- Extracting `truncateStepEndStderr` into a shared module.
- Modifying production code in `run-cycle.ts` or any `exec-*.ts`.
- Adding codex or gemini agent tests (claudecode path covers the shared `step.end` emission logic).

## Implementation Approach

Pure test-append + docs edit. All three new tests follow the established fake-binary-on-PATH pattern from line 109–115 of the existing dispatch test file. Each test creates its own `bin` dir in `mkdtemp`, writes a bash script, passes it on `PATH`, and cleans up in `finally`. Prompt file created in each test's `try` block. Append tests in AC order (1→2→3) after the existing integration tests and before the unit tests for `truncateStepEndStderr`.

---

## Task 1: Add Three Regression Tests

### Overview

Append three integration tests to `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` covering AC-1 (spec guard), AC-2 (provider non-zero verbatim), and AC-3 (over-2000-byte agent truncation). Update the import line to include `formatSpecGuardError` and `SPEC_MIN_BYTES`.

### Changes Required

**File**: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`

**Import line** (line 7–11): extend to add `formatSpecGuardError` and `SPEC_MIN_BYTES`:

```typescript
import {
  runCycle,
  truncateStepEndStderr,
  MAX_STEP_END_STDERR,
  SPEC_MIN_BYTES,
} from "../../src/engine/run-cycle.ts";
```

(`formatSpecGuardError` is NOT needed in the test — the assertion strategy uses `SPEC_MIN_BYTES` as a known substring that must appear in any guard error message, avoiding the need to reconstruct the artifact path.)

**Append after line 134** (after the `"successful agent step.end omits stderr key"` test, before the unit tests at line 136), insert three new `test()` blocks:

**Test 1 — AC-1 (spec guard failure)**:
```typescript
test("spec post-condition guard failure emits stderr from formatSpecGuardError", async () => {
  const root = await setupRepo(
    `      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`,
  );
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    // exit 0 with stdout shorter than SPEC_MIN_BYTES (200) — triggers spec guard
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
    assert.ok(
      typeof parsed.stderr === "string" && parsed.stderr.length > 0,
      "stderr must be non-empty",
    );
    assert.ok(
      (parsed.stderr as string).includes(String(SPEC_MIN_BYTES)),
      `stderr must mention the threshold (${SPEC_MIN_BYTES})`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

**Test 2 — AC-2 (provider non-zero verbatim)**:
```typescript
test("provider non-zero exit carries verbatim stderr on step.end", async () => {
  const root = await setupRepo(
    `      - name: build
        agent: claudecode
        prompt: prompts/build.md
`,
  );
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    await writeFile(
      fake,
      "#!/bin/bash\nprintf 'agent failed: detail\\n' >&2\nexit 1\n",
      "utf8",
    );
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

**Test 3 — AC-3 (over-2000-byte agent truncation)**:
```typescript
test("over-2000-byte agent stderr is head-capped at MAX_STEP_END_STDERR with trailing ellipsis", async () => {
  const root = await setupRepo(
    `      - name: flood
        agent: claudecode
        prompt: prompts/flood.md
`,
  );
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/flood.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    // printf 2500 'x' chars to stderr, then exit 1
    await writeFile(
      fake,
      "#!/bin/bash\nprintf '%2500s' | tr ' ' 'x' >&2\nexit 1\n",
      "utf8",
    );
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

### Success Criteria

- [ ] `npm run typecheck` clean — no new TS errors from added imports or test bodies
- [ ] All 8 tests pass in the dispatch test file: 5 existing + 3 new
- [ ] `npm test` green (full suite)
- [ ] `src/engine/run-cycle.ts` line and branch coverage do not regress vs master baseline (≥95% line, ≥75% branch per CLAUDE.md)

---

## Task 2: Update docs/ENGINE.md § "Failed step.end stderr"

### Overview

Replace the two-sentence section at lines 80–82 to enumerate all three emission sites and remove any implication that the gate is bash-only.

### Changes Required

**File**: `docs/ENGINE.md`

**Current** (lines 80–82):
```
Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"`, not `r.stderr` truthiness.
```

**Replace with**:
```
Failed `step.end` events carry a head-capped `stderr` field (2000-char, via `MAX_STEP_END_STDERR` + `truncateStepEndStderr` in `run-cycle.ts`). Successful events omit the field. Gate is `r.status === "failed"` across all agents, not `r.stderr` truthiness. Three emission sites set `r.stderr` before the gate fires: (1) `UnknownAgentError` during dispatch (`run-cycle.ts:~219`) — error message verbatim; (2) spec post-condition guard (`run-cycle.ts:~231`) — `formatSpecGuardError(path, bytes, SPEC_MIN_BYTES)`; (3) provider-module non-zero exit in `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts` — captured stderr stream, head-capped at 2000 chars.
```

### Success Criteria

- [ ] § "Failed step.end stderr" enumerates all three emission sites with file references
- [ ] No mention of bash-only gating
- [ ] `npm run typecheck` unaffected (docs-only change)

---

## Task 3: Write BUILD.md with refl-0029 Citation

### Overview

Create `docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md` with coverage numbers and the AC-6 refl-0029 subsumption note.

### Changes Required

**File**: `docs/cycle/0127-feature-extend-head-capped-stderr-field-on-faile/BUILD.md`

Content (fill coverage numbers from `npm run test:coverage` output after Task 1 passes):

```markdown
# Build Notes: Cycle 0127

## Coverage

Run `npm run test:coverage` after tests pass and record actuals here.

| Metric | Result | Baseline |
|--------|--------|----------|
| Line   | TBD    | ≥95%     |
| Branch | TBD    | ≥75%     |
| Function | TBD  | ≥90%     |

`src/engine/run-cycle.ts` has no per-file floor; aggregate must not regress.

## refl-0029 Subsumption

`docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` is already in `done/`. That raw's intent — surface `UnknownAgentError` via the `step.end` dispatch path — is now pinned by AC-1's regression test in this cycle. No additional work required.
```

### Success Criteria

- [ ] BUILD.md exists at the cycle doc path
- [ ] Contains coverage numbers from actual `npm run test:coverage` run
- [ ] Cites `refl-0029` file by name and explains subsumption

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **AC-1 (spec guard test):** A test verifies that a failing `spec` step (post-condition guard: stdout < `SPEC_MIN_BYTES`) emits `step.end` with `status: "failed"` and a non-empty `stderr` field containing the formatted guard error from `formatSpecGuardError`. Uses a fake `claudecode` binary that exits 0 with stdout shorter than 200 bytes.` | Task 1 | Test 1 — fake `claude` exits 0 with `echo 'hi'` (3 bytes), step named `spec`, asserts `status: "failed"` and `stderr.includes("200")` |
| `[ ] **AC-2 (provider non-zero exit test):** A test exercises a provider step where a fake binary on PATH exits non-zero with stderr output, and confirms the `step.end` event carries `stderr` equal to that output verbatim (when under 2000 chars).` | Task 1 | Test 2 — fake `claude` writes `"agent failed: detail\n"` to stderr, exits 1, asserts `parsed.stderr === "agent failed: detail\n"` |
| `[ ] **AC-3 (over-2000-byte agent path test):** A test uses a fake binary emitting 2500 `x` chars to stderr (exits 1) and confirms `step.end.stderr` is exactly 2000 chars ending in `…`.` | Task 1 | Test 3 — `printf '%2500s' \| tr ' ' 'x' >&2; exit 1`, asserts `length === 2000` and `endsWith("…")` |
| `[ ] **AC-4 (successful agent step.end unchanged):** Existing test "successful agent step.end omits stderr key" in `run-cycle.step-end-stderr-dispatch.test.ts` continues to pass without modification.` | Task 1 | No code change to existing test; passes as part of full suite run |
| `[ ] **AC-5 (ENGINE.md accurate):** `docs/ENGINE.md` § "Failed step.end stderr" enumerates all three failure sources (dispatch/`UnknownAgentError`, spec post-condition guard, provider-module non-zero exit) and states the gate as `r.status === "failed"` across all agents.` | Task 2 | Direct prose replacement at lines 80–82 |
| `[ ] **AC-6 (refl-0029 subsumed):** `docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` exists; BUILD.md notes that this cycle subsumes that raw's intent (surface `UnknownAgentError` via dispatch path) via the unified `stderr` field.` | Task 3 | BUILD.md cites file by name; file already in `done/` |
| `[ ] All existing tests still pass (`npm test`).` | Task 1 | Verified by full suite run after appending tests |
| `[ ] `npm run test:coverage` passes; `src/engine/run-cycle.ts` line/branch coverage does not regress vs master baseline.` | Task 1 | Coverage numbers recorded in BUILD.md |
| `[ ] No compiler/linter warnings (`npm run typecheck`).` | Task 1 | Import additions are from already-exported symbols |

---

## Testing Strategy

### Unit Tests

No new unit tests — `truncateStepEndStderr` unit tests (3) already exist at lines 136–154. AC-3 exercises the same truncation logic end-to-end.

### Integration Tests

All three new tests call `runCycle` end-to-end (no mocking of `truncateStepEndStderr` or `formatSpecGuardError`):
- **AC-1**: triggers spec guard via real `sanitizeArtifactStdout` + `Buffer.byteLength` check in `runCycle`
- **AC-2**: triggers real `exec-claudecode.ts` stderr stream capture + `step.end` emission
- **AC-3**: triggers real `truncateStepEndStderr` call inside the `step.end` spread

Fake binaries are minimal bash scripts placed in a `mkdtemp` bin dir on PATH — no mocking of Node modules.

## Risk Assessment

- **`printf '%2500s' | tr ' ' 'x'`** portability: both `printf` and `tr` are available on macOS and Linux. If the pipe fails, the binary exits non-zero but with empty stderr — test would fail clearly with `"flood step.end must carry stderr"`. Acceptable; alternative is `python3 -c "import sys; sys.stderr.write('x'*2500)"` if bash version causes issues.
- **Spec guard path dependency**: `prepareTrunkArtifactDir` must complete before the guard fires. `workflowYml` uses `mode: trunk` — guaranteed. The artifact dir is created unconditionally for trunk mode.
- **`SPEC_MIN_BYTES` string in guard error**: `formatSpecGuardError` produces a human-readable message — it's virtually certain to include "200" (the threshold). If the format changes, the test assertion breaks loudly. Acceptable coupling.
```
