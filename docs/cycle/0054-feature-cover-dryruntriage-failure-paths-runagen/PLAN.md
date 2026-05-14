```markdown
# Implementation Plan: Cycle 0054

## Overview
Pin the two `dryRunTriage` failure paths (`runAgent` throws mid-attempt; prompt template absent) with two new entry-point tests in `tests/engine/triage-dry-run.test.ts`, plus a minimal `try/catch` wrap around the dry-run prompt-template `readFile` in `src/engine/triage.ts` that re-throws `prompt template missing: <resolved-path>: <cause>`. Documents the resulting Case A / Case B shapes in CLAUDE.md.

## Current State (from Research)
- `dryRunTriage` body: `src/engine/triage.ts:253-301`. Returns `DryRunReport[]`; no `Logger`; no filesystem mutations.
- `runAgent` catch (`agent failed: <msg>`, Case A path) — `src/engine/triage.ts:113-119` inside `processRawWithRetry`; shared with `runTriage`.
- Prompt template read site (Case B touch point) — `src/engine/triage.ts:263-266`. Bare `await readFile(join(repoRoot, ".cycle", cfg.triage.prompt), "utf8")` propagating raw ENOENT.
- `MAX_ATTEMPTS = 3` at `triage.ts:88`; `dryRunTriage` clones each raw with `attempts: 0` (`triage.ts:274`) → Case A `attempts: 3` is the locked shape when all attempts exhaust.
- `DryRunReport` shape at `triage.ts:80-86` — `{ raw_id, status, attempts, last_error?, children? }`.
- Test harness: `tests/engine/triage-dry-run.test.ts`. Reusable helpers — `makeConfig()` (`:22-34`), `setupRepo()` (`:36-49`), `rawBody()` (`:51-64`, frontmatter is `id|source: text|title|added_at|triage_attempts`), `dirHash()`/`fileBytes()` (`:93-121`), canonical byte-identity assertion pattern (`:232-303`), sentinel `runAgent` stub shape (`:316-320`).
- CLI surface (`src/cli/triage.ts:22-40`) calls `dryRunTriage` with no try/catch; synchronous throw already propagates to non-zero exit via the existing top-level CLI handler.
- Coverage gate `src/engine/triage.ts ≥ 95%` already holds today; the new tests close the dry-run-specific gap without changing the gate.

## Desired End State
- `tests/engine/triage-dry-run.test.ts` has two new `test(...)` cases:
  1. `"dryRun Case A: runAgent throws → status failed, attempts 3, last_error matches /^agent failed: /"` with seeded `boom: claude spawn failed` substring assertion plus full no-mutation invariants.
  2. `"dryRun Case B: missing prompt template → throws 'prompt template missing: <path>: ...'"` using `assert.rejects`, with no-mutation invariants.
- `src/engine/triage.ts:263-266` is wrapped:
  ```ts
  // dryRunTriage contract: a missing prompt template throws synchronously
  // (before any agent is invoked) so operators iterating on the prompt
  // after engine.paused see a clear "prompt template missing" surface.
  const promptPath = join(repoRoot, ".cycle", cfg.triage.prompt);
  let promptTemplate: string;
  try {
    promptTemplate = await readFile(promptPath, "utf8");
  } catch (e) {
    throw new Error(`prompt template missing: ${promptPath}: ${(e as Error).message}`);
  }
  ```
- `CLAUDE.md` Commands-table row for `cycle triage --dry-run` extended with one clause documenting both observable shapes.
- `npm test`, `npm run typecheck`, `npm run test:coverage` all clean. Per-file floor `src/engine/triage.ts ≥ 95%` holds. Aggregate floors (line ≥ 95%, branch ≥ 75%, func ≥ 90%) do not regress.

## What We're NOT Doing
- No change to `runTriage` shape or behavior for either failure mode.
- No change to `processRawWithRetry`, `validateOutput`, or the `MAX_ATTEMPTS` constant.
- No new public exported error class — flat `Error` with message prefix only.
- No change to `setupRepo()` or any other existing test helper. Case B inlines its own scaffolding (omits the prompt write).
- No new `runAgent` registered names, no CLI wiring change in `src/cli/triage.ts` or `src/cli.ts`.
- No use of `Error(..., { cause })` — flat message form for assertion stability, matching `agent failed: ${...message}` precedent at `triage.ts:116`.
- No README.md edits (no user-facing surface change).
- No new E2E tests in `tests/cli/` — existing dry-run integration coverage there is unchanged.

## Implementation Approach
Three vertical slices, in order: (1) wrap + intent comment in `triage.ts` plus the Case B test that pins the new surface (TDD: write the test first, watch it fail on master, then add the wrap and watch it pass); (2) Case A test that exercises the shared `runAgent`-throws catch through the `dryRunTriage` entry point; (3) docs sync (CLAUDE.md row extension). Slices 1 and 2 each include both implementation and test in the same commit-ready unit. Slice 3 is doc-only.

Test ordering is deliberate: Case B drives the only source code change, so it gets written first. Case A only needs a test (the catch at `triage.ts:113-119` already exists and is exercised by `runTriage` tests) — it locks the observable shape via the `dryRunTriage` entry point.

---

## Task 1: Add Case B test + wrap `readFile` in `dryRunTriage`

### Overview
TDD: add the Case B test against the not-yet-existing wrap, confirm it fails on master, then add the localized wrap in `triage.ts` and the one-line intent comment.

### Changes Required

**File**: `tests/engine/triage-dry-run.test.ts`
**Changes**: Append a new test at the bottom of the file (after the last existing test). It mints its own tmp root inline (does NOT use `setupRepo()` — `setupRepo()` writes the prompt unconditionally) and creates `.cycle/` and `docs/cycle/issues/raw/` (no `.cycle/prompts/`), seeds one raw, snapshots `tbd.jsonl`/`log.jsonl` ENOENT state, asserts `dryRunTriage` rejects with the prefix and resolved path, then asserts no filesystem mutations.

```ts
test("dryRun Case B: missing prompt template → throws 'prompt template missing: <path>: ...'", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-nopromp-"));
  try {
    // Scaffold raw/ + .cycle/ but DO NOT write .cycle/prompts/triage.md.
    await mkdir(join(root, ".cycle"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/raw/solo.md"),
      rawBody("solo", "solo"),
      "utf8",
    );

    const before = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    const cfg = makeConfig();
    const resolvedPromptPath = join(root, ".cycle", cfg.triage.prompt);
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        throw new Error("runAgent must not be called when prompt template is missing");
      },
    };

    await assert.rejects(
      dryRunTriage(root, cfg, deps),
      (e: Error) =>
        /^prompt template missing: /.test(e.message) &&
        e.message.includes(resolvedPromptPath),
    );

    const after = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };
    assert.deepEqual(after.raw, before.raw, "raw/ contents changed");
    assert.deepEqual(after.todo, before.todo, "todo/ contents changed");
    assert.equal(after.tbd, before.tbd, "tbd.jsonl appeared");  // both null
    assert.equal(after.log, before.log, "log.jsonl appeared");  // both null
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**File**: `src/engine/triage.ts`
**Changes**: Replace lines `263-266` with the wrapped form. Place the one-line intent comment immediately above the `try`.

Before:
```ts
  const promptTemplate = await readFile(
    join(repoRoot, ".cycle", cfg.triage.prompt),
    "utf8",
  );
```

After:
```ts
  // dryRunTriage contract: a missing prompt template throws synchronously
  // (before any agent is invoked) so operators iterating on the prompt
  // after engine.paused see a clear "prompt template missing" surface.
  const promptPath = join(repoRoot, ".cycle", cfg.triage.prompt);
  let promptTemplate: string;
  try {
    promptTemplate = await readFile(promptPath, "utf8");
  } catch (e) {
    throw new Error(`prompt template missing: ${promptPath}: ${(e as Error).message}`);
  }
```

### Success Criteria
- [ ] On master (before the wrap is in place), the new Case B test FAILS with an error message of the form `ENOENT: no such file or directory, open '<path>'` (or, equivalently, the `assert.rejects` predicate returns false because the regex doesn't match).
- [ ] After the wrap is added, the new Case B test PASSES.
- [ ] `npm run typecheck` clean.
- [ ] `npm test` clean (full suite — all eight existing `triage-dry-run.test.ts` tests still pass; no helper changes).
- [ ] After the test resolves the rejection: `docs/cycle/issues/raw/solo.md` still present and byte-identical; `docs/cycle/issues/todo/` empty; `.cycle/tbd.jsonl` and `.cycle/log.jsonl` both still ENOENT.

---

## Task 2: Add Case A test (`runAgent` throws → status failed, attempts 3)

### Overview
Add a `dryRunTriage`-entry-point test that pins the `agent failed: <msg>` shape and the `attempts: 3` retry-budget exhaustion. The production code already produces this shape via the shared catch at `triage.ts:113-119`; this test locks the dry-run-specific surface.

### Changes Required

**File**: `tests/engine/triage-dry-run.test.ts`
**Changes**: Append a second new test after the Case B test. Uses `setupRepo()` (prompt is present for Case A), seeds one raw, stubs `runAgent` to throw `boom: claude spawn failed`, asserts the report shape and the no-mutation invariants.

```ts
test("dryRun Case A: runAgent throws → status failed, attempts 3, last_error matches /^agent failed: /", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/solo.md"),
      rawBody("solo", "solo"),
      "utf8",
    );

    const before = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        throw new Error("boom: claude spawn failed");
      },
    };

    const reports = await dryRunTriage(root, makeConfig(), deps);

    assert.equal(reports.length, 1);
    const r = reports[0]!;
    assert.equal(r.raw_id, "solo");
    assert.equal(r.status, "failed");
    assert.equal(r.attempts, 3);
    assert.ok(r.last_error, "last_error present");
    assert.match(r.last_error!, /^agent failed: /);
    assert.ok(
      r.last_error!.includes("boom: claude spawn failed"),
      `last_error includes inner: ${r.last_error}`,
    );
    assert.equal(calls, 3, "runAgent invoked exactly MAX_ATTEMPTS times");

    const after = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };
    assert.deepEqual(after.raw, before.raw, "raw/ contents changed");
    assert.deepEqual(after.todo, before.todo, "todo/ contents changed");
    assert.deepEqual(after.done, before.done, "done/ contents changed");
    assert.deepEqual(after.failed, before.failed, "failed/ contents changed");
    assert.equal(after.tbd, before.tbd, "tbd.jsonl appeared");  // both null
    assert.equal(after.log, before.log, "log.jsonl appeared");  // both null
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Test passes on master (the catch path it pins already exists) and continues to pass after Task 1's wrap.
- [ ] `runAgent` invoked exactly 3 times (`calls === 3`) — proves the dry-run uses the full retry budget and ignores on-disk `triage_attempts` (the cloned `attempts: 0` at `triage.ts:274`).
- [ ] `r.last_error` starts with `agent failed: ` and includes the inner `boom: claude spawn failed` substring.
- [ ] No filesystem mutations under `docs/cycle/issues/{raw,todo,done,failed}/`; `.cycle/tbd.jsonl` and `.cycle/log.jsonl` still ENOENT.
- [ ] `npm test` clean.

---

## Task 3: CLAUDE.md row extension for `cycle triage --dry-run`

### Overview
Extend the Commands-table row for `cycle triage --dry-run` with one clause documenting both observable failure shapes so they become part of the contract.

### Changes Required

**File**: `CLAUDE.md`
**Changes**: In the Commands table, edit the existing `cycle triage --dry-run` row. Append at the end of the row's description:

> Missing prompt template at `.cycle/<cfg.triage.prompt>` throws synchronously before any agent is invoked, with the message prefix `prompt template missing: <resolved-path>: <cause>`. An agent that crashes mid-call surfaces as `{status: "failed", attempts: 3, last_error: "agent failed: <inner>"}` in the report after the configured retry budget is exhausted.

### Success Criteria
- [ ] CLAUDE.md row reads as a complete contract that callers (operators iterating on a paused engine) can rely on.
- [ ] No other CLAUDE.md sections edited.
- [ ] No README.md edits.

---

## Testing Strategy

### Unit Tests
- Case A and Case B both unit-level on `dryRunTriage` directly (no CLI plumbing, no real subprocess). Uses dependency-injected `runAgent` stub from `TriageDeps`.
- Case A asserts: report row shape (`raw_id`, `status`, `attempts`, `last_error` regex + substring), exact call count `=== 3`, full filesystem-invariance suite (`raw`/`todo`/`done`/`failed` dir hashes, `tbd.jsonl`/`log.jsonl` ENOENT).
- Case B asserts: rejection predicate (`/^prompt template missing: /` AND `e.message.includes(resolvedPromptPath)`), partial filesystem-invariance suite (the test never creates `done/`/`failed/`, so it skips those dir hashes), sentinel `runAgent` never called.
- **Mocking strategy**: dependency injection only, no module mocks. `runAgent` stubbed via `TriageDeps`; everything else is real (real `fs/promises`, real `mkdtemp`, real path joining). Aligns with the existing test file's anti-mock posture.

### Integration / E2E Tests
- None added. The existing dry-run integration test under `tests/cli/` continues to cover CLI plumbing unchanged. SPEC explicitly puts CLI-layer changes out of scope; the synchronous throw from `dryRunTriage` already routes through the existing CLI top-level error handler to a non-zero exit.

### Coverage verification
- After Tasks 1 + 2: run `npm run test:coverage`. Confirm:
  - `scripts/coverage-gate.mjs` (posttest:coverage) exits 0 — per-file floor `src/engine/triage.ts ≥ 95%` holds.
  - Aggregate floors (line ≥ 95%, branch ≥ 75%, func ≥ 90%) do not regress vs the master baseline reported in CLAUDE.md.

## Risk Assessment
- **Risk**: Adding the `try/catch` around `readFile` widens a branch and could nudge per-file branch coverage. **Mitigation**: Case B exercises the throw path; the happy-path read is already exercised by all existing dry-run tests. Both branches covered after Task 1; per-file line floor `≥ 95%` is the gated metric, not branch.
- **Risk**: `assert.equal(after.tbd, before.tbd)` comparing two `null` values is reference-equal but technically passes — could mask a real Buffer write. **Mitigation**: That's the right shape — both sides are `null` when the file is ENOENT (per `fileBytes()` contract at `:114-121`), and the assertion fires if either side becomes a `Buffer`. The byte-identity test at `:232-303` uses `.equals()` for the Buffer case; our Case A/B never seed those files, so `null === null` is the correct invariance shape.
- **Risk**: A future refactor moves the prompt-template read out of `dryRunTriage` (e.g., into a shared loader). **Mitigation**: Case B asserts on the entry-point behavior, not on the call site; any refactor that preserves `dryRunTriage(root, cfg, deps)`'s observable contract continues to satisfy the test. The one-line intent comment in `triage.ts` makes the contract explicit for future readers.
- **Risk**: Flat error message hides the original `ENOENT` `code`. **Mitigation**: Out of scope per SPEC; if a future caller needs the `code`, switch to `Error(..., { cause: e })` — the test regex still matches. Flat form chosen for assertion stability and to match the `agent failed: ${...message}` precedent at `triage.ts:116`.
- **Risk**: The CLAUDE.md row extension drifts from the implementation if the message shape changes. **Mitigation**: The Case B test pins the prefix `prompt template missing: ` against the implementation; any drift breaks the test before it reaches CLAUDE.md. Case A's `agent failed: ` prefix is similarly pinned by the test.
```
