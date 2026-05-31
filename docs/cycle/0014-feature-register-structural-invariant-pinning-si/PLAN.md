# Implementation Plan: Cycle 0014

## Overview
Register one new build-time structural invariant in `scripts/structural-invariants.mjs` that pins the inlined terminal-failure bookkeeping mutation (`consecutiveFailures += 1`) in `src/cli.ts` to its single sanctioned occurrence (the resume block), so any re-inlined call-site re-introduction fails `npm run check:invariants`. Extend the checker's test suite with violation and clean `src/cli.ts` fixtures.

## Current State (from Research)
- `scripts/structural-invariants.mjs` holds a 4-entry `INVARIANTS` table of `{ file, pattern (global regex), expected (number), reason (string) }`. The checker reads each target at `join(process.cwd(), file)`, counts `(text.match(pattern) ?? []).length`, prints `structural-invariants: ok -- ${file} ${reason}: ${actual}` to stdout on pass, `structural-invariants: FAIL ${file} -- ${reason}: expected ${expected}, got ${actual}` to stderr on mismatch (exit 1), and `process.exit(2)` on an unreadable target.
- `src/cli.ts` has exactly one inlined bookkeeping mutation: `consecutiveFailures += 1;` at `src/cli.ts:440` paired with `failedCycles.push(tail.cycleId);` at `src/cli.ts:441` (the resume block, `src/cli.ts:439-447`). The three delegating supervisor branches use assignment from the helper result instead (`consecutiveFailures = acct.consecutiveFailures;` at `src/cli.ts:535,588,608`), and the functional non-mutating form (`prev.consecutiveFailures + 1`) lives only in `src/engine/halt-accounting.ts:35-36`, which a `src/cli.ts`-targeted rule never scans.
- `tests/scripts/structural-invariants.test.ts` spawns the checker via `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })` against a temp dir built by `setup(cwd, content)`, which writes `content` to `src/engine/triage.ts`, `"// stub"` to `src/cli.ts`, and `"// stub"` to `src/engine/commit-cycle.ts`. Three tests exist: violation (exit 1), clean (exit 0, empty stderr), and a real-repo-root regression pin (exit 0, empty stderr).
- Fixture-file precedent: `tests/fixtures/structural-invariants/triage-violation.ts` / `triage-clean.ts`.

### Open Questions — Resolved
- **Single regex vs two entries**: Use one entry with pattern `/consecutiveFailures \+= 1/g`, `expected: 1`. A live grep confirms `consecutiveFailures += 1` occurs exactly once in `src/cli.ts` (line 440); the delegating sites use `consecutiveFailures = acct.consecutiveFailures`, which the `+= 1` anchor does not match, and the functional form in `halt-accounting.ts` is out of scan scope. This yields exactly 1 against the live file (non-vacuous) and is the simplest unambiguous anchor. A two-entry or multiline paired pattern is rejected as more brittle against the checker's single global-regex posture.
- **Extend `setup` vs parallel helper**: Add an optional third parameter `cliContent = "// stub"` to the existing `setup` helper. Existing two-arg callers are unaffected; new tests pass controllable `src/cli.ts` content.
- **Inline strings vs fixture files**: Add fixture files `tests/fixtures/structural-invariants/cli-violation.ts` and `cli-clean.ts`, consistent with the existing `triage-*.ts` fixture convention.

## Desired End State
- `scripts/structural-invariants.mjs` has a 5th `INVARIANTS` entry targeting `src/cli.ts` with pattern `/consecutiveFailures \+= 1/g` and `expected: 1`.
- `npm run check:invariants` exits 0 and stdout includes an `ok` line naming the new `src/cli.ts` rule.
- `tests/scripts/structural-invariants.test.ts` has two new tests (violation → exit 1 with file/reason/expected-got substrings; clean → exit 0, no stderr) plus the unchanged regression pin.
- Verify: `npm run check:invariants` exits 0; `npm test` passes; `npm run typecheck` clean.

## What We're NOT Doing
- No change to runtime terminal-failure bookkeeping, `recordTerminalFailure`, or supervisor control flow in `src/cli.ts`. Build-time guard only.
- No refactor or generalization of the checker mechanism (no AST matching, no multi-file rules). Reuse the per-file regex-count posture as-is.
- No invariants for any other drift hazard (agent-fleet REGISTRY consistency, etc.).
- No new structured `.cycle/log.jsonl` events — the checker communicates only via stdout/stderr/exit code.
- No CLAUDE.md/README edits (the structural-invariants policy section already documents the table as the single source of truth; no convention or command change).

## Implementation Approach
Append one declarative entry to the `INVARIANTS` table — no checker control-flow change. The `+= 1` anchor uniquely identifies the inlined mutation while ignoring the delegating assignment form, giving `expected: 1` against the live file. Tests mirror the existing three-shape pattern (violation, clean, regression-pin) for the new rule, with `setup` minimally widened to make `src/cli.ts` content controllable. New fixtures hold a 2-occurrence violation file and a 1-occurrence clean file.

## Failure & Resilience Decisions

**Task 1 (add INVARIANTS entry)** — N/A — pure data: appends a literal object to an in-file array. No I/O, subprocess, or network introduced by the change itself. The checker's own I/O (file read, exit codes) is pre-existing and unmodified.

**Task 2 (extend `setup`, add tests, add fixtures)** — test code performing filesystem I/O via the existing harness:
- **Failure modes**: temp-dir creation (`mkdtemp`), fixture reads (`readFile`), and writes (`writeFile`) can fail; on failure the test rejects and `node:test` reports the failing test — propagated, never swallowed. The spawned checker's non-zero exit is the assertion target, not an error to suppress.
- **Idempotency**: each test creates a unique `mkdtemp(join(tmpdir(), "cycle-si-…"))` root and removes it in `finally` via `rm(root, { recursive: true, force: true })`, matching the existing suite. Re-runs are independent; no shared mutable state. The checker is a stateless read-and-count with no persistence, locks, or dedup keys — re-run safe by construction.
- **Observability**: failures surface through `node:test` assertion output (`result.status`, `result.stderr`); the production checker's diagnostics are its `ok`/`FAIL` lines and exit code, which the tests assert against directly.
- **No silent failure**: no `try/catch` swallows errors; the only `try` wraps cleanup in `finally`. Assertion failures and I/O rejections both fail the test loudly.

---

## Task 1: Register the terminal-failure bookkeeping invariant

### Overview
Add the 5th `INVARIANTS` entry pinning the inlined `consecutiveFailures += 1` mutation in `src/cli.ts` to its single sanctioned occurrence.

### Changes Required
**File**: `scripts/structural-invariants.mjs`
**Changes**: Append one entry to the `INVARIANTS` array (after the existing `commit-cycle.ts` entry, before the closing `];`):

```js
  {
    file: 'src/cli.ts',
    pattern: /consecutiveFailures \+= 1/g,
    expected: 1,
    reason:
      'terminal-failure bookkeeping single-implementation: the inlined consecutiveFailures += 1 mutation is sanctioned only in the resume block; all other supervisor branches must delegate to recordTerminalFailure',
  },
```

No change to the checker loop, exit-code semantics, or imports.

### Success Criteria
- [ ] `npm run check:invariants` exits 0 and stdout contains `structural-invariants: ok -- src/cli.ts terminal-failure bookkeeping single-implementation…: 1`.
- [ ] Pattern matches exactly 1 occurrence against the live `src/cli.ts` (non-vacuous, not 0).
- [ ] No existing `ok` lines regress; the two pre-existing `triage.ts` rules, the `commit-scope-guard-loop` rule, and the `commit-cycle.ts` rule still pass.
- [ ] Failure paths behave as designed: re-inlining the mutation (count 2) makes the checker emit the `FAIL` stderr line and exit 1; an unreadable target still exits 2 (unchanged).

---

## Task 2: Test the new rule (violation, clean, fixtures, harness extension)

### Overview
Make `src/cli.ts` content controllable in the test harness and add violation + clean tests for the new rule, plus their fixture files. Preserve the existing regression-pin test.

### Changes Required

**File**: `tests/fixtures/structural-invariants/cli-violation.ts` (new)
**Changes**: A stub containing the inlined mutation **twice** (count 2 > expected 1):

```ts
// fixture: re-inlined terminal-failure bookkeeping (violation)
consecutiveFailures += 1;
failedCycles.push(tail.cycleId);
// a second, illegitimate re-inline at a delegating call site:
consecutiveFailures += 1;
failedCycles.push(r.cycleId);
```

**File**: `tests/fixtures/structural-invariants/cli-clean.ts` (new)
**Changes**: A stub matching the current single-implementation layout — the mutation **once** (resume block), with delegating sites shown as assignment so the fixture documents the sanctioned shape:

```ts
// fixture: current single-implementation layout (clean)
// resume block — sole sanctioned inlined occurrence:
consecutiveFailures += 1;
failedCycles.push(tail.cycleId);
// delegating call sites use assignment, not the += mutation:
consecutiveFailures = acct.consecutiveFailures;
failedCycles = acct.failedCycles;
```

**File**: `tests/scripts/structural-invariants.test.ts`
**Changes**:
1. Widen `setup` with an optional third parameter so `src/cli.ts` content is controllable; existing two-arg callers are unchanged:

```ts
async function setup(cwd: string, content: string, cliContent = "// stub") {
  await mkdir(join(cwd, "src/engine"), { recursive: true });
  await writeFile(join(cwd, "src/engine/triage.ts"), content);
  await writeFile(join(cwd, "src/cli.ts"), cliContent);
  await writeFile(join(cwd, "src/engine/commit-cycle.ts"), "// stub");
}
```

2. Add a violation test — clean triage content so only the cli rule fails:

```ts
test("structural-invariants: cli bookkeeping re-inlined -> exit 1, stderr names src/cli.ts + reason + expected/got", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-cli-fail-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-violation.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("src/cli.ts"));
    assert.match(result.stderr, /terminal-failure bookkeeping single-implementation/);
    assert.match(result.stderr, /expected 1/);
    assert.match(result.stderr, /got 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

3. Add a clean test — clean triage + single-occurrence cli fixture → exit 0, empty stderr:

```ts
test("structural-invariants: cli single-implementation layout -> exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-cli-pass-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-clean.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

The existing real-repo regression-pin test is left unchanged and now also exercises the new rule against the live `src/cli.ts`.

### Success Criteria
- [ ] Builds/typechecks cleanly (`npm run typecheck`).
- [ ] Violation test: exit 1, stderr contains `src/cli.ts`, the reason substring, and `expected 1` / `got 2`.
- [ ] Clean test: exit 0, empty stderr.
- [ ] Regression-pin test still passes (live `src/cli.ts` count == 1).
- [ ] All existing tests pass (`npm test`); the two pre-existing triage tests still use the two-arg `setup` unchanged.
- [ ] Failure paths behave as designed: assertion/I/O errors surface through `node:test`; no error swallowed; temp dirs cleaned in `finally`.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] scripts/structural-invariants.mjs contains exactly one new INVARIANTS entry whose file is src/cli.ts and whose reason references the terminal-failure bookkeeping single-implementation rule.` | Task 1 | Single entry, `file: 'src/cli.ts'`, reason names the single-implementation rule + resume-block exception. |
| `[ ] npm run check:invariants exits 0 against the current repository and its stdout includes an ok line for the new src/cli.ts rule.` | Task 1 | `expected: 1` == live count → `ok` line emitted. |
| `[ ] A new test in tests/scripts/structural-invariants.test.ts writes a src/cli.ts fixture containing the bookkeeping sequence inlined more than the expected number of times, runs the checker, and asserts exit status 1 with stderr containing src/cli.ts, the rule's reason substring, and the expected … got … mismatch text.` | Task 2 | Violation test + `cli-violation.ts` (count 2); asserts file, reason, `expected 1`/`got 2`. |
| `[ ] A new (or extended) test writes a src/cli.ts fixture matching the current single-implementation layout and asserts the checker exits 0 with no stderr for that rule.` | Task 2 | Clean test + `cli-clean.ts` (count 1); asserts exit 0, empty stderr. |
| `[ ] The existing "real repo root -> exit 0 (regression pin)" test still passes, confirming the new pattern matches the sanctioned occurrence count and is not vacuous against the live src/cli.ts.` | Task 1, Task 2 | Pattern yields exactly 1 against live file; regression-pin test left unchanged. |
| `[ ] All existing tests still pass (npm test).` | Task 2 | Optional third `setup` param keeps two-arg callers working. |
| `[ ] No compiler/linter warnings introduced (npm run typecheck).` | Task 1, Task 2 | `.mjs` data change + typed test additions only. |

---

## Testing Strategy

### Unit Tests
- **Happy path / clean**: `cli-clean.ts` (one `consecutiveFailures += 1`) → checker exit 0, no stderr for the new rule.
- **Failure path / violation**: `cli-violation.ts` (two occurrences) → exit 1 with `src/cli.ts`, reason substring, and `expected 1` / `got 2` in stderr. This exercises the count-mismatch → `console.error` → `failed++` → `exit(1)` path of the checker.
- **Regression pin / non-vacuous**: existing real-repo-root test confirms the live `src/cli.ts` count equals `expected: 1`, guarding against an over-tight pattern that matches zero.
- **Mocking strategy**: none. Real `spawnSync` of the actual checker against a real temp filesystem, matching the existing suite (consistent with the CLAUDE.md note that `node:fs/promises` cannot be `mock.method`-stubbed — avoided entirely here).

### Integration / E2E Tests
- `npm run check:invariants` end-to-end against the repo root must exit 0 with an `ok` line for the new rule (also covered transitively by `posttest:coverage` wiring).
- `npm test` full suite green, confirming the `setup` signature change does not break the two pre-existing triage-rule tests.

## Risk Assessment
- **Pattern matches zero (vacuous rule)**: mitigated by the regression-pin test asserting live exit 0 with `expected: 1` — a zero match would make actual 0 ≠ 1 and fail the pin.
- **Pattern false-positively matches a delegating site or the functional helper form**: mitigated by anchoring on `+= 1`; delegating sites use `= acct.…` and the functional form (`+ 1`, no `+=`) lives in `halt-accounting.ts`, outside the `src/cli.ts` scan. Verified by grep: a single `consecutiveFailures += 1` occurrence.
- **`setup` signature change breaks existing callers**: mitigated by defaulting `cliContent = "// stub"`, preserving the prior behavior for the two two-arg callers.
- **Future legitimate edits to the resume block shift the count**: acceptable and intended — any change to the inlined-mutation count is a deliberate signal requiring an `expected` bump, which is the guard's purpose.
