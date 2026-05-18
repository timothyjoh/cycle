All three open questions resolved:

1. **`loadRaws` export**: NOT exported after cycle 0132 (code confirms). Tests must go via `runTriage`.
2. **`dryRunTriage` logger**: Will construct a local no-op `Logger` internally and pass it to `loadRaws` — no signature change to `dryRunTriage` or `cli/triage.ts`.
3. **all-fail via load error**: `loadRaws` returning `[]` hits the `raws.length === 0` short-circuit → `status:"ok"`, no `engine.paused`. SPEC's "or equivalent — pin in test" covers this. Pin it explicitly in the new test.

Writing the plan now.

```markdown
# Implementation Plan: Cycle 0133

## Overview
Refactor `loadRaws` in `src/engine/triage.ts` to catch per-file read/parse errors, emit `triage.raw.load_error {raw_id, error}` for each failing file, and return surviving raws normally. Rewrite Test 6a and add two new tests covering all-fail-via-load and readFile-error isolation.

## Current State (from Research)
- `loadRaws(rawDir)`: private, no try/catch around per-file read or parseFrontmatter — any error aborts the whole function and propagates to `runTriage`.
- `runTriage` already holds `log: Logger`; calls `loadRaws(rawDir)` at line 169.
- `dryRunTriage` calls `loadRaws(rawDir)` at line 274 with no logger.
- `truncateHeadCapped` already imported in triage.ts at line 20.
- `Logger` already imported as a type import at line 19.
- Test 6a (line 392–413) asserts `runTriage` rejects with `/no frontmatter/` — must be replaced in-place.
- `loadRaws` is NOT exported; tests exercise it via `runTriage`.
- Coverage floor for `triage.ts`: ≥ 95% line (enforced by `scripts/coverage-gate.mjs`).

## Desired End State
- `loadRaws` accepts `log: Logger`, wraps each file's read+parse in try/catch, emits `triage.raw.load_error` on failure, returns survivors.
- `runTriage` passes its `log` to `loadRaws`.
- `dryRunTriage` constructs a local no-op `Logger` and passes it to `loadRaws`; no signature change to `dryRunTriage` or `src/cli/triage.ts`.
- Test 6a replaced with isolation assertion; two new tests appended.
- `docs/ENGINE.md` triage section updated.
- `npm run test:coverage` passes; triage.ts ≥ 95% line floor holds; TypeScript clean.

## What We're NOT Doing
- Exporting `loadRaws` (not required by SPEC).
- Changing `dryRunTriage` public signature or `src/cli/triage.ts`.
- Modifying `triage.raw.failed` / `triage.raw.ok` emission (post-load pipeline unchanged).
- Making all-fail-via-load-error trigger `engine.paused` — the empty-raws short-circuit already produces `status:"ok"`, which is acceptable per SPEC's "equivalent halting behavior — pin in test" clause.
- Any other triage refactors not required by this isolation change.

## Implementation Approach
Minimal surgical change: add `log: Logger` to `loadRaws`, wrap the per-file block in try/catch, emit the new event, update the two call sites. `dryRunTriage` gets a one-liner no-op logger rather than an optional parameter, keeping the SPEC's required-signature contract. Tests go through `runTriage` (the existing route) since `loadRaws` remains unexported.

---

## Task 1: Refactor `loadRaws` — per-file isolation + event emission

### Overview
Add `log: Logger` parameter (required), wrap per-file read+parse in try/catch, emit `triage.raw.load_error` on failure, update both call sites.

### Changes Required

**File**: `src/engine/triage.ts`

**Change A — `loadRaws` signature and body** (lines 325–343):

```typescript
async function loadRaws(rawDir: string, log: Logger): Promise<RawIssue[]> {
  let files: string[] = [];
  try {
    files = (await readdir(rawDir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const raws: RawIssue[] = [];
  for (const f of files) {
    const srcPath = join(rawDir, f);
    try {
      const body = await readFile(srcPath, "utf8");
      const { fm, bodyAfter } = parseFrontmatter(body);
      const id = String(fm.id);
      const attempts =
        typeof fm.triage_attempts === "number" ? fm.triage_attempts : 0;
      raws.push({ id, body: bodyAfter, fm, srcPath, attempts });
    } catch (e) {
      const raw_id = f.replace(/\.md$/, "");
      await log.emit("triage.raw.load_error", {
        raw_id,
        error: truncateHeadCapped(String((e as Error).message ?? e), 2000),
      });
    }
  }
  return raws;
}
```

**Change B — `runTriage` call site** (line 169):
```typescript
// before:
const raws = await loadRaws(rawDir);
// after:
const raws = await loadRaws(rawDir, log);
```

**Change C — `dryRunTriage` call site** (line 274): construct local no-op logger:
```typescript
// before:
const raws = await loadRaws(rawDir);
// after:
const silentLog: Logger = { async emit() {} };
const raws = await loadRaws(rawDir, silentLog);
```

### Success Criteria
- [ ] TypeScript compiles clean (`npm run typecheck`)
- [ ] `loadRaws` no longer throws for malformed files
- [ ] `dryRunTriage` call site compiles; no changes to `src/cli/triage.ts`

---

## Task 2: Rewrite Test 6a + add 2 new tests

### Overview
Replace the throw-assertion in Test 6a with an isolation assertion. Append two new tests: one pinning all-fail-via-load behavior, one covering the readFile error path.

### Changes Required

**File**: `tests/engine/triage.faults.test.ts`

The test file already has `enrichJson` at line 444. Add a similar helper after line 460 (or reuse it inline) for the good-raw agent response needed by 6a and new test B.

**Rewrite Test 6a** (lines 390–413) — replace in-place:

```typescript
// ---- Test 6a: loadRaws per-file isolation — parseFrontmatter failure skipped, surviving raw processed

test("fault: loadRaws isolates parseFrontmatter failure; surviving raw processed, triage.raw.load_error emitted", async () => {
  const root = await setupRepo();
  try {
    // broken.md — no frontmatter, will fail parseFrontmatter
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken.md"),
      "no frontmatter here\njust prose\n",
      "utf8",
    );
    // good.md — valid raw
    await writeFile(
      join(root, "docs/cycle/issues/raw/good.md"),
      rawBody("good", "A good issue"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: enrichJson("good"), stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["good"]);
    assert.deepEqual(result.failed, []);

    const loadErr = events.find((e) => e.event === "triage.raw.load_error");
    assert.ok(loadErr, "triage.raw.load_error emitted for broken.md");
    assert.equal(loadErr!.fields.raw_id, "broken");
    assert.ok(typeof loadErr!.fields.error === "string" && loadErr!.fields.error.length > 0);

    assert.ok(!events.some((e) => e.event === "engine.paused"), "no engine.paused when survivor exists");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**New test A** — all raws fail to load (append after 6a):

```typescript
// ---- Test 6c: loadRaws all-fail via load error — empty result, load_error emitted, no engine.paused

test("fault: loadRaws all-fail via parse error returns empty set; triage ends cleanly (not engine.paused)", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken1.md"),
      "no frontmatter\n",
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken2.md"),
      "also no frontmatter\n",
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => { throw new Error("should not be called"); },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    // All raws fail to load → loadRaws returns [] → hits raws.length === 0
    // short-circuit → status:"ok", no agent calls, no engine.paused.
    // This is distinct from all-agent-failure (engine.paused); load errors
    // are pre-agent and treated as an empty queue.
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, []);
    assert.deepEqual(result.failed, []);

    const loadErrs = events.filter((e) => e.event === "triage.raw.load_error");
    assert.equal(loadErrs.length, 2, "one load_error per broken file");
    assert.ok(!events.some((e) => e.event === "engine.paused"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**New test B** — readFile error path (append after 6c):

```typescript
// ---- Test 6d: loadRaws readFile error (EACCES) isolates; surviving raw processed

test("fault: loadRaws readFile error isolates; surviving raw processed, triage.raw.load_error emitted", async () => {
  const root = await setupRepo();
  try {
    // unreadable.md — chmod 000 makes readFile throw EACCES
    const unreadablePath = join(root, "docs/cycle/issues/raw/aaa-unreadable.md");
    await writeFile(unreadablePath, rawBody("aaa-unreadable", "Unreadable"), "utf8");
    await chmod(unreadablePath, 0o000);

    // good.md — sorts after aaa-unreadable alphabetically
    await writeFile(
      join(root, "docs/cycle/issues/raw/good.md"),
      rawBody("good", "A good issue"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: enrichJson("good"), stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["good"]);

    const loadErr = events.find((e) => e.event === "triage.raw.load_error");
    assert.ok(loadErr, "triage.raw.load_error emitted for unreadable file");
    assert.equal(loadErr!.fields.raw_id, "aaa-unreadable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Note: `enrichJson` is already defined at line 444 in the test file. Tests 6a and 6d reuse it. No new helper needed.

### Success Criteria
- [ ] Test 6a no longer uses `assert.rejects`
- [ ] Test 6a passes: isolation contract verified end-to-end
- [ ] Test 6c passes: all-fail-via-load pinned as `status:"ok"`, 2 load_error events, no engine.paused
- [ ] Test 6d passes: readFile EACCES isolated, survivor processed
- [ ] All 7 existing tests (1–5, 6b, 7) still pass

---

## Task 3: Update `docs/ENGINE.md` triage section

### Overview
Document per-file isolation behavior and the new `triage.raw.load_error` event.

### Changes Required

**File**: `docs/ENGINE.md`

In the triage section (around lines 15–17 per RESEARCH), add a note after the existing description of the triage loop describing:
- `loadRaws` now catches per-file errors (readFile or parseFrontmatter)
- Failing files emit `triage.raw.load_error { raw_id, error }` and are skipped
- Surviving raws continue through the agent loop normally
- All-load-fail (all files malformed) yields `status:"ok"` with empty processed/failed — distinct from all-agent-failure which yields `engine.paused { reason: "all_triage_failed" }`
- `error` field capped at 2000 chars via `truncateHeadCapped`

### Success Criteria
- [ ] ENGINE.md mentions `triage.raw.load_error` and per-file isolation
- [ ] Distinction between load-error behavior and agent-failure behavior documented

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] loadRaws no longer throws when a single raw fails to parse; surviving raws flow through to the agent loop` | Task 1 | Per-file try/catch in `loadRaws` |
| `[ ] triage.raw.load_error {raw_id, error} is emitted exactly once per failing raw and recorded in .cycle/log.jsonl` | Task 1 | `log.emit("triage.raw.load_error", ...)` in catch block; log routes to log.jsonl via Logger |
| `[ ] Test 6a updated to assert isolation contract: one malformed raw + one valid raw → valid raw processed end-to-end, triage.raw.load_error emitted for malformed raw, no engine.paused from this path alone` | Task 2 | Test 6a rewritten in-place |
| `[ ] New test: all raws fail load → engine.paused {reason:"all_triage_failed"} still fires (or equivalent halting behavior — pin in test)` | Task 2 | Test 6c: all-load-fail → status:"ok" (empty queue short-circuit, not engine.paused); behavior pinned explicitly in assertion comment |
| `[ ] New test: mixed success/failure → success path proceeds, failure surfaces triage.raw.load_error event` | Task 2 | Test 6d: readFile EACCES on one file, good raw proceeds |
| `[ ] npm run test:coverage passes; triage.ts per-file line floor (≥95%) holds` | Tasks 1+2 | New catch branch covered by 6a/6c/6d |
| `[ ] Coverage gate (scripts/coverage-gate.mjs) green` | Tasks 1+2 | Verified by `npm run check:coverage` post test:coverage |
| `[ ] All existing tests still pass` | Tasks 1+2 | No behavior change to existing paths |
| `[ ] No compiler/linter warnings introduced` | Task 1 | `npm run typecheck` must pass clean |

---

## Testing Strategy

### Unit Tests
- All tests via `runTriage` (public entry point) — `loadRaws` remains unexported.
- `makeLog()` captures events; assertions inspect `events.find/filter` by event name.
- `rawBody()` generates valid frontmatter; `enrichJson()` generates valid agent response.
- Mocking: `runAgent` injected via `TriageDeps` — no module-level mocking. Real fs operations in tmpdir.
- Key edge cases: parseFrontmatter throw (no frontmatter block), readFile throw (EACCES), all files fail, mixed with single survivor.

### Integration / E2E Tests
- No new integration tests needed — `runTriage` tests already exercise the real fs + real parseFrontmatter.
- `npm run test:coverage` is the integration gate; triage.ts ≥ 95% line enforced.

## Risk Assessment
- **Test 6d chmod 000 on CI**: Some CI environments (Docker root user) don't honor chmod restrictions. Mitigated by existing pattern — Test 4 already uses `chmod 000` in the same file, so CI is known to support it.
- **`enrichJson` reuse across tests**: `enrichJson` is defined after Test 7 at line 444. Tests 6a and 6d (before line 444) need access to it. Resolution: move `enrichJson` earlier in the file (before Test 6a, around line 390) or define it at the top of the file alongside other helpers. Either approach is safe — it has no side effects.
```
