Have everything needed. Writing plan.

```markdown
# Implementation Plan: Cycle 0196

## Overview
Add `log: Logger` and `cycleId: string` parameters to `appendDocumentationPaths` in `run-cycle.ts`, emit `documentation.paths_appended` after the successful `writeFile` call, update the call site, add two new tests, and document the new event in ENGINE.md.

## Current State (from Research)
- `appendDocumentationPaths` at `run-cycle.ts:47` takes `(repoRoot: string, buildMdPath: string)` — no logger.
- `writeFile` is at line 98; early return at line 87 already prevents emission on no-op.
- Call site at line 337 is wrapped in `try { … } catch { /* best-effort */ }` — no guard changes needed.
- `Logger` type is already imported; `log` and `cycleId` are both in scope at the call site.
- Sibling events `documentation.skipped` (run-cycle.ts:356) and `reflection.surfaced` (reflection.ts:112) establish payload conventions: `{ cycle_id, … }`.
- Test helpers `setupBuildDocWorkflow`, `setupGitRepoWithReadme`, `expectExactlyOne`, `parseLog` already available in `tests/engine/run-cycle.documentation.test.ts` (507 lines, 9 existing tests).
- ENGINE.md documentation step section is at lines 72–77.

## Desired End State
- `appendDocumentationPaths(repoRoot, buildMdPath, log, cycleId)` — new signature.
- `log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend })` fires after `writeFile` succeeds when `toAppend.length > 0`.
- Call site passes `log` and `cycleId`.
- Two new tests in `run-cycle.documentation.test.ts` verify happy-path emission and no-op non-emission.
- ENGINE.md documents the new event.
- `npm run typecheck` clean; `npm run test:coverage` all gates pass.

## What We're NOT Doing
- No changes to `Logger` type or log schema enforcement.
- No consumers (dashboards, metrics, downstream handlers) of the new event.
- No changes to `scopeGuard` or commit-cycle behavior.
- No changes to any other call sites (there is only one).

## Implementation Approach
Single-function signature extension with one emit call. Three tasks: (1) core change — signature + emit + call site together because they're coupled, (2) tests, (3) docs. Minimal blast radius; existing tests unaffected since the call site change is additive.

---

## Task 1: Extend `appendDocumentationPaths` signature and emit event

### Overview
Add `log` and `cycleId` params, emit `documentation.paths_appended` after `writeFile`, update call site.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change 1** — function signature at line 47:
```typescript
// Before
async function appendDocumentationPaths(repoRoot: string, buildMdPath: string): Promise<void> {

// After
async function appendDocumentationPaths(repoRoot: string, buildMdPath: string, log: Logger, cycleId: string): Promise<void> {
```

**Change 2** — emit after `writeFile` at line 98:
```typescript
// Before
  lines.splice(insertIdx, 0, ...toAppend.map((p) => `- ${p}`));
  await writeFile(buildMdPath, lines.join("\n"), "utf8");
}

// After
  lines.splice(insertIdx, 0, ...toAppend.map((p) => `- ${p}`));
  await writeFile(buildMdPath, lines.join("\n"), "utf8");
  await log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend });
}
```

**Change 3** — call site at line 337:
```typescript
// Before
await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"));

// After
await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId);
```

### Success Criteria
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` passes (all existing tests green)

---

## Task 2: Add two new tests in `run-cycle.documentation.test.ts`

### Overview
Test that `documentation.paths_appended` fires with correct payload on happy path, and does not fire when `toAppend` is empty.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

**Test A — happy path emission** (append after line 507, before closing `}`):

Scenario: Build step lists only `src/dummy.ts` in `## Touched Files`; doc fake writes to `README.md` (creating a modified tracked file absent from the touched list). Assert `documentation.paths_appended` fires exactly once with `appended` containing `"README.md"`.

```typescript
test("documentation.paths_appended emitted when paths are appended", async () => {
  const { root, bin } = await setupBuildDocWorkflow(/* README.md not in touched list */);
  try {
    // fake doc agent that touches README.md
    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nprintf 'docs updated'\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "PATHS-APPENDED-1",
      title: "emit test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const rawLog = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(rawLog);
    const ev = expectExactlyOne(events, "documentation.paths_appended");
    assert.ok(Array.isArray(ev.appended));
    assert.ok((ev.appended as string[]).includes("README.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

**Test B — no-op non-emission**:

Scenario: Both `src/dummy.ts` and `README.md` are listed in `## Touched Files`. After doc step runs, `toAppend` is empty. Assert `documentation.paths_appended` is absent from the event log.

```typescript
test("documentation.paths_appended not emitted when toAppend is empty", async () => {
  const { root, bin } = await setupBuildDocWorkflow(/* README.md already in touched list */);
  try {
    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nprintf 'docs updated'\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "PATHS-APPENDED-2",
      title: "no-op test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const rawLog = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(rawLog);
    const absent = events.filter((e: { event?: string }) => e.event === "documentation.paths_appended");
    assert.equal(absent.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

> **Note**: Use the existing `setupBuildDocWorkflow` helper. To control whether `README.md` appears in `## Touched Files`, inspect how the helper constructs `BUILD.md` and either pass a parameter or create a thin variant that includes/excludes `README.md` in the touched-files list. Do not over-engineer — one helper call + a targeted `writeFile` override is sufficient.

### Success Criteria
- [ ] Both new tests pass
- [ ] All 9 existing tests still pass
- [ ] `npm run test:coverage` coverage gates still pass (new code is fully exercised by the two new tests)

---

## Task 3: Update ENGINE.md documentation step section

### Overview
Add one sentence to the documentation step section at ENGINE.md lines 72–77 noting the new `documentation.paths_appended` event.

### Changes Required

**File**: `docs/ENGINE.md`

Append to the end of the documentation step paragraph (after "silently skipped when BUILD.md is absent or has no `## Touched Files` section."):

```
After a successful auto-append, `documentation.paths_appended { cycle_id, appended: string[] }` is emitted with the list of paths that were written; no event is emitted when all touched paths were already listed (no-op case).
```

### Success Criteria
- [ ] ENGINE.md sentence added
- [ ] No other docs changed

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] appendDocumentationPaths` accepts `log: Logger` and `cycleId: string` as additional parameters | Task 1 | signature change at run-cycle.ts:47 |
| `[ ] After writeFile, log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend })` is called | Task 1 | emit at run-cycle.ts:98 |
| `[ ] When toAppend is empty the function returns early before reaching writeFile and no event is emitted` | Task 2 | Test B asserts absence of event |
| `[ ] Call site in runCycle passes log and cycleId to appendDocumentationPaths` | Task 1 | call site update at run-cycle.ts:337 |
| `[ ] New test: documentation.paths_appended fires with correct appended array when the documentation step appends at least one path` | Task 2 | Test A |
| `[ ] New test: documentation.paths_appended is absent from the log when toAppend is empty (all touched files already listed in BUILD.md)` | Task 2 | Test B |
| `[ ] All existing tests still pass` | Tasks 1–2 | enforced by full `npm test` run |
| `[ ] No TypeScript errors (npm run typecheck clean)` | Task 1 | verified after signature change |
| `[ ] Coverage gates pass (npm run test:coverage)` | Tasks 1–2 | new emit line covered by Test A |

---

## Testing Strategy

### Unit Tests
- Both new tests are integration-style (real fs, real `runCycle`) using the established pattern in `run-cycle.documentation.test.ts`.
- No mocking of `Logger` — `runCycle` wires the real logger backed by `log.jsonl`; read the file afterward with `parseLog`.
- Test A triggers the emit by ensuring `README.md` is tracked/modified but absent from `## Touched Files`.
- Test B prevents the emit by ensuring `README.md` is already listed in `## Touched Files`.
- Use `expectExactlyOne` for Test A (cardinality-pinned per CLAUDE.md convention).
- Use `filter(...).length === 0` for Test B (absence assertion).

### Integration / E2E Tests
- Existing 9 tests in `run-cycle.documentation.test.ts` cover the full documentation step path; the new signature is backward-compatible at the test-call level since the tests call `runCycle` (not `appendDocumentationPaths` directly).

## Risk Assessment
- **`setupBuildDocWorkflow` may not expose a parameter to control the Touched Files list**: inspect the helper before writing tests; may need a small inline `writeFile` to overwrite `BUILD.md` with the desired touched-files content after setup. This is low-risk — the helper is in the same test file and straightforward.
- **`log.emit` is async**: already handled — `await` is added in the emit call.
- **Call site `catch` swallows emit errors**: acceptable; SPEC explicitly preserves best-effort semantics.
```
