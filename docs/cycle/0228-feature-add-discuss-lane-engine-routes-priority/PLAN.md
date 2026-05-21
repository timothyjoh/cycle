# Implementation Plan: Cycle 0228

## Overview

Add a `discuss/` lifecycle folder to the triage pipeline. When `runTriage` encounters a raw with `priority: discuss`, it parks the file in `docs/cycle/issues/discuss/` unchanged, emits `issue.parked_for_discussion`, and skips the agent call entirely.

## Current State (from Research)

- `runTriage` loops over raws and calls `processRawWithRetry` for each — no pre-agent routing check exists.
- `Priority` type in `queue.ts:6` already includes `"discuss"` as a valid value (cycle 0226).
- `moveToFailed` at `triage.ts:681–699` establishes the exact pattern: `mkdir({ recursive: true })` then `rename(srcPath, join(dir, `${id}.md`))` — no frontmatter mutation for discuss.
- `TriageDeps.runAgent` is spy-injectable in tests; `triage-priority.test.ts` already has `rawBody(id, title, priority?)` supporting `priority: discuss`.
- `docs/cycle/issues/discuss/` does not exist yet; `setupRepo()` in tests does not create it.
- RFC-001 lists `blocked/` as the structural model for a new lifecycle folder.

## Desired End State

After this cycle:
- `src/engine/triage.ts` contains a `parkForDiscussion` helper and a pre-agent routing check in `runTriage`.
- `docs/cycle/issues/discuss/.gitkeep` is tracked in the repo.
- `tests/engine/triage-priority.test.ts` contains four new test cases covering: discuss routing, non-discuss unchanged, release round-trip, and multi-raw mixed.
- `docs/RFC-001-issue-lifecycle.md` documents `discuss/` in the folder layout and frontmatter sections.
- `npm test` passes, `triage.ts` coverage stays ≥ 95%, `npm run typecheck` is clean.

## What We're NOT Doing

- Engine-side scanning or auto-promotion of `discuss/` items.
- CLI commands for managing `discuss/` items.
- Discuss routing in `dryRunTriage` (known gap; out of scope per SPEC).
- Changes to `normalizePriority`, `parseFrontmatter`, or `TriageDeps`.
- Adding a `parked` count to `TriageResult` or `triage.end` event.

## Implementation Approach

Single insertion point in `runTriage`'s for-loop — a pre-agent `if`/`continue` block. The helper function `parkForDiscussion` mirrors `moveToFailed` structurally (mkdir + rename + no frontmatter mutation) and appends a `log.emit`. No new dependencies injected; `log` and `repoRoot` are already in scope. Tests extend `triage-priority.test.ts` with a capturing `makeLogCapturing()` variant to verify event fields.

---

## Task 1: Create `discuss/` Directory

### Overview

Add `docs/cycle/issues/discuss/.gitkeep` so the directory is tracked in git before any engine run that uses the feature.

### Changes Required

**File**: `docs/cycle/issues/discuss/.gitkeep`
**Changes**: Create as an empty file.

### Success Criteria

- [ ] `docs/cycle/issues/discuss/.gitkeep` exists and is tracked by git.

---

## Task 2: Implement Discuss Routing in `src/engine/triage.ts`

### Overview

Add a `parkForDiscussion` helper function and insert a pre-agent routing check in `runTriage`'s for-loop. A raw with `priority === "discuss"` is moved to `discuss/`, emits `issue.parked_for_discussion`, and the loop continues — skipping `processRawWithRetry` entirely.

### Changes Required

**File**: `src/engine/triage.ts`

**Add `parkForDiscussion` after `moveToFailed` (after line 699):**

```typescript
async function parkForDiscussion(
  repoRoot: string,
  raw: RawIssue,
  log: Logger,
): Promise<void> {
  const discussDir = join(repoRoot, "docs/cycle/issues/discuss");
  await mkdir(discussDir, { recursive: true });
  const destPath = join(discussDir, `${raw.id}.md`);
  try {
    await rename(raw.srcPath, destPath);
  } catch {
    // raw may have been removed mid-flight; nothing else to do
  }
  await log.emit("issue.parked_for_discussion", {
    id: raw.id,
    priority: "discuss",
    path: destPath,
  });
}
```

**Modify `runTriage` for-loop (insert before line 194, the `processRawWithRetry` call):**

```typescript
  for (const raw of raws) {
    if (raw.fm.priority === "discuss") {
      await parkForDiscussion(repoRoot, raw, log);
      continue;
    }

    const outcome = await processRawWithRetry(raw, {
      // ... unchanged
    });
    // ... unchanged
  }
```

**Behavior of edge cases:**
- All raws are `discuss`: `processed` and `failed` stay empty; `failed.length === raws.length` evaluates `0 === N` → false; falls through to `triage.end` with `processed: 0, failed: 0`. Correct.
- Mixed batch: only non-discuss raws participate in `processed`/`failed` accounting.
- `dryRunTriage`: no change; will call agent for `discuss` raws (known gap, out of scope).

### Success Criteria

- [ ] `npm run typecheck` passes (no new type errors; `raw.fm.priority === "discuss"` is valid since `FrontmatterValue` includes `string`).
- [ ] `parkForDiscussion` function exists after `moveToFailed` in `triage.ts`.
- [ ] `runTriage` for-loop has discuss routing check before `processRawWithRetry` call.

---

## Task 3: Tests in `tests/engine/triage-priority.test.ts`

### Overview

Add four test cases covering all four scenarios from the SPEC Testing Strategy. Add a `makeLogCapturing()` helper (returns `{ log, events }`) since the existing `makeLog()` discards events.

### Changes Required

**File**: `tests/engine/triage-priority.test.ts`

**Add `makeLogCapturing()` helper** after the existing `makeLog()` at line 36:

```typescript
type Captured = { event: string; fields: Record<string, unknown> };

function makeLogCapturing(): { log: Logger; events: Captured[] } {
  const events: Captured[] = [];
  const log: Logger = {
    async emit(event: string, fields: Record<string, unknown>) {
      events.push({ event, fields });
    },
  };
  return { log, events };
}
```

**Add four test cases** (add additional imports: `exists` via `stat` or check file presence via `readFile` try/catch, and `readdir` from existing imports):

**Test 1 — Discuss routing: agent never called, file parked, no side effects**

```typescript
test("discuss raw: agent never called, file moved to discuss/, no todo, no queue row, event emitted", async () => {
  const root = await setupRepo();
  try {
    const id = "test-discuss-01";
    await writeFile(
      join(root, "docs/cycle/issues/raw", `${id}.md`),
      rawBody(id, "Discuss this", "discuss"),
      "utf8",
    );

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    await runTriage(root, makeConfig(), log, { runAgent });

    assert.equal(agentCalled, false, "agent must not be called for discuss raw");

    const discussPath = join(root, "docs/cycle/issues/discuss", `${id}.md`);
    const content = await readFile(discussPath, "utf8");
    assert.ok(content.includes("priority: discuss"), "discuss file content preserved");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo")).catch(() => []);
    assert.equal(todoFiles.filter(f => f.startsWith(id)).length, 0, "no todo file");

    const queue = await readQueue(join(root, "docs/cycle/issues"));
    assert.equal(queue.filter(r => r.id === id).length, 0, "no queue row");

    const parked = events.filter(e => e.event === "issue.parked_for_discussion");
    assert.equal(parked.length, 1, "exactly one parked event");
    assert.equal(parked[0].fields.id, id);
    assert.equal(parked[0].fields.priority, "discuss");
    assert.ok(
      (parked[0].fields.path as string).endsWith(`discuss/${id}.md`),
      "path points to discuss dir",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 2 — Non-discuss raw triages normally (regression guard)**

```typescript
test("non-discuss raw (priority: high) triages normally", async () => {
  const root = await setupRepo();
  try {
    const id = "test-high-01";
    await writeFile(
      join(root, "docs/cycle/issues/raw", `${id}.md`),
      rawBody(id, "High priority task", "high"),
      "utf8",
    );

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: enrichJson(id), stderr: "" };
    };

    const { log } = makeLog();
    await runTriage(root, makeConfig(), log, { runAgent });

    assert.equal(agentCalled, true, "agent must be called for non-discuss raw");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.ok(todoFiles.some(f => f.includes(id)), "todo file created");

    const queue = await readQueue(join(root, "docs/cycle/issues"));
    assert.ok(queue.some(r => r.id === id), "queue row written");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 3 — Release round-trip: park then retriage with real priority**

```typescript
test("discuss raw moved back to raw/ with priority: medium is triaged on next run", async () => {
  const root = await setupRepo();
  try {
    const id = "test-roundtrip-01";
    const rawPath = join(root, "docs/cycle/issues/raw", `${id}.md`);
    await writeFile(rawPath, rawBody(id, "Roundtrip test", "discuss"), "utf8");

    const { log: log1 } = makeLog();
    await runTriage(root, makeConfig(), log1, { runAgent: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });

    // Verify parked
    const discussPath = join(root, "docs/cycle/issues/discuss", `${id}.md`);
    await readFile(discussPath, "utf8"); // throws if not found

    // Simulate human: move back to raw/ with real priority
    const updatedContent = rawBody(id, "Roundtrip test", "medium");
    await writeFile(rawPath, updatedContent, "utf8");

    let agentCalled = false;
    const runAgent = async (): Promise<TriageAgentResult> => {
      agentCalled = true;
      return { exitCode: 0, stdout: enrichJson(id), stderr: "" };
    };
    const { log: log2 } = makeLog();
    await runTriage(root, makeConfig(), log2, { runAgent });

    assert.equal(agentCalled, true, "agent called after re-drop to raw/");
    const queue = await readQueue(join(root, "docs/cycle/issues"));
    assert.ok(queue.some(r => r.id === id), "queue row written after round-trip");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 4 — Mixed batch: discuss parked, normal triaged**

```typescript
test("mixed batch: discuss raw parked, normal raw triaged", async () => {
  const root = await setupRepo();
  try {
    const discussId = "test-mixed-discuss";
    const normalId = "test-mixed-normal";
    await writeFile(
      join(root, "docs/cycle/issues/raw", `${discussId}.md`),
      rawBody(discussId, "Discuss item", "discuss"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw", `${normalId}.md`),
      rawBody(normalId, "Normal item", "medium"),
      "utf8",
    );

    const calledFor: string[] = [];
    const runAgent = async (_prompt: string): Promise<TriageAgentResult> => {
      // determine which raw from prompt content
      calledFor.push("called");
      return { exitCode: 0, stdout: enrichJson(normalId), stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    const result = await runTriage(root, makeConfig(), log, { runAgent });

    // discuss raw parked, not in processed
    assert.ok(result.processed.includes(normalId), "normal raw in processed");
    assert.ok(!result.processed.includes(discussId), "discuss raw not in processed");
    assert.ok(!result.failed.includes(discussId), "discuss raw not in failed");

    assert.equal(calledFor.length, 1, "agent called exactly once (for normal raw)");

    const parked = events.filter(e => e.event === "issue.parked_for_discussion");
    assert.equal(parked.length, 1, "exactly one parked event");
    assert.equal(parked[0].fields.id, discussId);

    const discussPath = join(root, "docs/cycle/issues/discuss", `${discussId}.md`);
    await readFile(discussPath, "utf8"); // throws if not found

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.ok(!todoFiles.some(f => f.startsWith(discussId)), "no todo for discuss raw");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Note: `enrichJson` in `triage-priority.test.ts` uses `raw_id: rawId` in children. When `runAgent` is called in mixed-batch test, the agent mock returns `enrichJson(normalId)` regardless of which raw triggered it. The test works because only one agent call occurs and it returns valid JSON for the normal raw.

### Success Criteria

- [ ] Four new test cases pass.
- [ ] `npm run test:coverage` shows `triage.ts` line coverage ≥ 95%.
- [ ] `npm run check:coverage` passes.

---

## Task 4: Update `docs/RFC-001-issue-lifecycle.md`

### Overview

Add `discuss/` to the folder layout diagram and add a frontmatter block documenting its release mechanism, mirroring the `blocked/` entry structure.

### Changes Required

**File**: `docs/RFC-001-issue-lifecycle.md`

**Folder layout block (around line 22–35):** Add `discuss/` entry after `blocked/`:

```
├── discuss/    # Items parked for human judgment. Engine routes any raw with
│               # priority: discuss here before agent call. To release: edit
│               # priority to a real value and move back to raw/.
```

**Frontmatter section (after the `blocked/` block at line 101–110):** Add:

```markdown
### Discuss (`discuss/<id>.md`)

```yaml
---
# … original frontmatter unchanged …
priority: discuss   # set by the issue author; engine routes on this value
---
```

**Release mechanism:** Set `priority` to `low | medium | high | critical` and move the file back to `raw/`. The next engine run will triage it normally via `processRawWithRetry`.
```

**Folder layout diagram note:** The `priority: discuss` hint is already documented in the raw frontmatter block at line 52–53 — no change needed there.

### Success Criteria

- [ ] `discuss/` appears in the folder layout code block with description and release mechanism.
- [ ] A `Discuss` subsection exists after `Blocked` in the frontmatter section.
- [ ] Document renders correctly (no broken fences or indentation errors).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A raw file with `priority: discuss` frontmatter is moved to `docs/cycle/issues/discuss/<id>.md` with content identical to the source file.` | Task 2, Task 3 | `parkForDiscussion` uses `rename` with no frontmatter mutation; Test 1 asserts content preserved |
| `[ ] No `tbd.jsonl` row is written and no `docs/cycle/issues/todo/<id>.md` file is created for a `priority: discuss` raw.` | Task 3 | Test 1 asserts no todo file and no queue row |
| `[ ] The triage agent is never called for a `priority: discuss` raw (verifiable via injected `runAgent` spy in tests).` | Task 3 | Test 1 asserts `agentCalled === false`; Test 4 asserts agent called exactly once (for normal raw only) |
| `[ ] `issue.parked_for_discussion` log event is emitted with `id`, `priority`, and `path` fields present and correct.` | Task 2, Task 3 | Test 1 asserts all three fields; `path` asserted to end with `discuss/<id>.md` |
| `[ ] A raw with `priority: low`, `medium`, `high`, or `critical` triages normally — agent called, todo file created, queue row written.` | Task 3 | Test 2 covers `high`; Test 4 covers `medium` |
| `[ ] A file moved from `discuss/` back to `raw/` with a real priority is triaged and queued on the next engine run.` | Task 3 | Test 3 (release round-trip) |
| `[ ] `docs/cycle/issues/discuss/.gitkeep` exists in the repo.` | Task 1 | Created as empty file |
| `[ ] RFC-001 documents `discuss/` as a lifecycle state with its release mechanism.` | Task 4 | Folder layout + frontmatter subsection |
| `[ ] `npm test` passes with zero failures.` | All tasks | Verified after Task 3 |
| `[ ] Coverage floor for `src/engine/triage.ts` remains at or above 95%.` | Task 3 | New branches covered by Tests 1–4; verified via `npm run check:coverage` |
| `[ ] All existing tests still pass.` | Task 2 | Routing check is additive; existing behavior unchanged |
| `[ ] No compiler warnings from `npm run typecheck`.` | Task 2 | `raw.fm.priority === "discuss"` is valid (`FrontmatterValue` includes `string`) |

---

## Testing Strategy

### Unit Tests

- **`parkForDiscussion`** is tested indirectly through `runTriage` integration tests (same pattern as `moveToFailed`). No isolated unit test needed — the function has no complex branching beyond a try/catch on rename.
- **Edge cases covered**: all-discuss batch (implicitly via Test 1 — only one raw, it's discuss), non-discuss unchanged (Test 2), mixed batch (Test 4), round-trip (Test 3).
- **Event cardinality**: Tests assert `parked.length === 1` (filter + length check), per CLAUDE.md exactly-once convention.

### Integration / E2E Tests

- All four test cases run `runTriage` end-to-end against a real temp directory. No mocking of `fs` or `log`. Only `runAgent` is injected as a spy, which is the established pattern throughout `triage-priority.test.ts` and `triage.test.ts`.
- `readQueue` is called directly to assert queue state — real queue file, not mocked.

## Risk Assessment

- **`FrontmatterValue` string comparison**: `raw.fm.priority === "discuss"` compares against a union type (`string | number | string[]`). TypeScript allows this without a cast since `string` is in the union. No runtime risk — `parseFrontmatter` returns the bare string `"discuss"` for `priority: discuss`. No issue.
- **`all_triage_failed` false negative when all raws are discuss**: `failed.length === raws.length` evaluates `0 === N` → false. Engine emits `triage.end` with `processed: 0, failed: 0` and returns `{ status: "ok", ... }`. This is correct — parked items are not failures. No issue.
- **`dryRunTriage` inconsistency**: `dryRunTriage` calls the agent for `discuss` raws (no routing check added). This is a known gap documented in SPEC Out of Scope. No test covers this behavior in this cycle; a follow-up cycle can address it.
- **`discuss/` not in `setupRepo()`**: Tests rely on `mkdir({ recursive: true })` inside `parkForDiscussion` to create the directory. This is correct — the implementation creates it on first use, just as `moveToFailed` does for `failed/`. No pre-existence assertion in tests.
