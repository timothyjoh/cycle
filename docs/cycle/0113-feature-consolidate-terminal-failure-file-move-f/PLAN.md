**Q1: Which imports are orphaned in `cli.ts` after extraction?**
- `writeFile` — only in `terminalDrain` line 175 → **remove**
- `unlink` — only in `terminalDrain` line 179 → **remove**
- `serializeFrontmatter`, `mutateFrontmatter` — only in `terminalDrain` → **remove**
- `Frontmatter` type — only in `terminalDrain` → **remove**
- `drainFailedTerminal` — only in `terminalDrain` → **remove**
- `propagateBlocked` — only in `terminalDrain` → **remove**
- `parseFrontmatter` — also at lines 275 and 406 (workflow name resolution) → **keep**

**Q2: Coverage floor?** Set at 95% line — matches `triage.ts` pattern, appropriate for a small focused module with comprehensive tests.

**Fallback test strategy:** Call `terminalDrain` with a non-existent `todoPath`. `mutateFrontmatter` throws ENOENT; fallback `readFile` catches ENOENT (body = ""), fallback `unlink` catches ENOENT — both tolerances exercised cleanly without filesystem permission tricks.

```markdown
# Implementation Plan: Cycle 0113

## Overview
Extract `terminalDrain` from `src/cli.ts` into a new module `src/engine/issue-lifecycle.ts`, wire the import back into `cli.ts`, and add dedicated unit tests covering both execution paths. No behavior changes.

## Current State (from Research)
- `terminalDrain` (lines 126–198) lives in `src/cli.ts` as a private function with 8 parameters.
- Two code paths: happy path (`mutateFrontmatter` succeeds → rename) and fallback (`mutateFrontmatter` throws → manual parse/serialize/writeFile/rename/unlink).
- Four call sites in `cli.ts`: lines 336, 346, 442, 463.
- `src/engine/issue-lifecycle.ts` and `tests/engine/issue-lifecycle.test.ts` do not exist.
- `scripts/coverage-gate.mjs` FLOORS table has only `triage.ts`; must be extended.
- Test patterns established in `tests/engine/blocked.test.ts`: `makeLogger()`, `setupRepo()`, `seedTodo()`, real filesystem via `mkdtemp`.

## Desired End State
- `src/engine/issue-lifecycle.ts` exports `terminalDrain` with identical signature and body.
- `src/cli.ts` imports `terminalDrain` from `./engine/issue-lifecycle.ts`; all imports made redundant by extraction are removed; `parseFrontmatter` import remains.
- `tests/engine/issue-lifecycle.test.ts` contains ≥2 tests (happy path, fallback path) achieving ≥95% line coverage on `issue-lifecycle.ts`.
- `scripts/coverage-gate.mjs` FLOORS includes `"src/engine/issue-lifecycle.ts": 95`.
- Full test suite passes. `npm run typecheck` clean. Coverage gates pass.

## What We're NOT Doing
- No behavior changes to `terminalDrain` logic.
- No changes to `drainSuccess`, `drainRetry`, or any other function in `cli.ts`.
- No new exports beyond `terminalDrain`.
- No refactoring of the extracted function's internals.
- No changes to the queue, frontmatter, blocked, or log modules.

## Implementation Approach
Pure lift-and-shift extraction in 4 vertical slices: create the new module, update the importer, add tests, extend the coverage gate. Each slice is independently verifiable. Tests use the real filesystem (no mocks) following `blocked.test.ts` conventions. The fallback path is triggered by passing a non-existent `todoPath`, which causes `mutateFrontmatter` to throw ENOENT and exercises both ENOENT-tolerant catch blocks in the fallback.

---

## Task 1: Create `src/engine/issue-lifecycle.ts`

### Overview
Move the `terminalDrain` function body verbatim into a new engine module and export it.

### Changes Required
**File**: `src/engine/issue-lifecycle.ts` (new)

```typescript
import { readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { mutateFrontmatter, parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import type { Frontmatter } from "./frontmatter.ts";
import { drainFailedTerminal } from "./queue.ts";
import { propagateBlocked } from "./blocked.ts";
import type { Logger } from "./log.ts";

export async function terminalDrain(
  cwd: string,
  log: Logger,
  todoPath: string,
  failedDir: string,
  cycleId: string,
  issueId: string,
  failingStep: string | undefined,
  failedAttempts: number,
): Promise<void> {
  // [exact body from src/cli.ts:136–197, no changes]
}
```

Copy the function body verbatim from `src/cli.ts:136–197`. The import extensions follow the `.ts` convention used throughout `src/engine/`.

### Success Criteria
- [ ] `npm run typecheck` passes with the new file present
- [ ] File exists at `src/engine/issue-lifecycle.ts`
- [ ] `terminalDrain` is exported (not just defined)

---

## Task 2: Update `src/cli.ts`

### Overview
Replace the `terminalDrain` function definition with an import from the new module; prune imports made redundant by the extraction.

### Changes Required
**File**: `src/cli.ts`

**A. Add import** (after existing engine imports, e.g. after line 26 `commitCycle` import):
```typescript
import { terminalDrain } from "./engine/issue-lifecycle.ts";
```

**B. Remove `terminalDrain` function body** (lines 126–198) — delete entirely.

**C. Prune `node:fs/promises` import** (line 1):
- Remove `writeFile`, `unlink`
- Keep `readFile`, `readdir`, `rename`, `mkdir`

**D. Prune `./engine/frontmatter.ts` import** (line 20):
- Remove `mutateFrontmatter`, `serializeFrontmatter`
- Keep `parseFrontmatter`

**E. Remove `type Frontmatter` import** (line 21) — entire line deleted.

**F. Remove `drainFailedTerminal` from queue import** (line 15 block):
- Keep `popNextPending`, `markInProgress`, `drainOk`, `drainFailedRetry`, `readQueue`

**G. Remove `propagateBlocked` import** (line 22) — entire line deleted.

### Success Criteria
- [ ] `npm run typecheck` passes (no unused imports, no missing symbols)
- [ ] `npm test` passes (all existing CLI tests continue to pass)
- [ ] No references to `terminalDrain` function definition remain in `cli.ts`
- [ ] `parseFrontmatter` import remains (still used at lines 275 and 406)

---

## Task 3: Create `tests/engine/issue-lifecycle.test.ts`

### Overview
Add two focused unit tests: happy path (frontmatter mutation succeeds, file renamed) and fallback path (`mutateFrontmatter` throws, manual stamp + atomic write).

### Changes Required
**File**: `tests/engine/issue-lifecycle.test.ts` (new)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminalDrain } from "../../src/engine/issue-lifecycle.ts";
import { writeQueue } from "../../src/engine/queue.ts";
import type { QueueRow } from "../../src/engine/queue.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

type EmittedEvent = { event: string; fields: Record<string, unknown> };

function makeLogger() {
  const events: EmittedEvent[] = [];
  return {
    events,
    logger: { async emit(event: string, fields: Record<string, unknown>) { events.push({ event, fields }); } },
  };
}

function queueRow(id: string): QueueRow {
  return { id, title: `${id} title`, status: "in_progress", attempt: 0, depends_on: [], triaged_at: "2026-05-13T10:00:00Z" };
}

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-issue-lifecycle-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
  return root;
}
```

**Test 1 — happy path:**
```
"terminalDrain: happy path stamps frontmatter and moves file to failed/"
```
- `setupRepo()`, seed `tbd.jsonl` with `writeQueue([queueRow(issueId)])`, write `todo/<issueId>.md` with minimal frontmatter.
- Call `terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, "build", 2)`.
- Assert `failed/<issueId>.md` exists.
- Assert `todo/<issueId>.md` does NOT exist.
- Parse frontmatter of `failed/<issueId>.md`; assert `fm.failed_at` is string, `fm.failed_step === "build"`, `fm.failed_attempts === 2`, `fm.last_cycle_id === "0099"`.
- Assert events contain `queue.drained` with `outcome: "terminal"`.
- Assert events do NOT contain `queue.drain_warning`.

**Test 2 — fallback path (mutateFrontmatter throws):**
```
"terminalDrain: fallback path handles missing todoPath — stamps and writes to failed/"
```
- `setupRepo()`, seed `tbd.jsonl` with `writeQueue([queueRow(issueId)])`.
- Do NOT write `todo/<issueId>.md` (non-existent file triggers `mutateFrontmatter` ENOENT).
- Call `terminalDrain(root, logger, todoPath, failedDir, "0099", issueId, undefined, 3)`.
- Assert `failed/<issueId>.md` exists.
- Parse frontmatter; assert `fm.failed_at` is string, `fm.failed_attempts === 3`, `fm.last_cycle_id === "0099"`, `typeof fm.drain_error === "string"`.
- Assert `fm.failed_step` is undefined (no failingStep passed).
- Assert events contain `queue.drain_warning`.
- Assert events contain `queue.drained` with `outcome: "terminal"`.

Both tests use `try/finally rm(root, { recursive: true, force: true })`.

### Success Criteria
- [ ] Both tests pass
- [ ] `npm run test:coverage` shows `src/engine/issue-lifecycle.ts` at ≥95% line coverage
- [ ] No external mocking — all filesystem ops use real temp dirs

---

## Task 4: Add Per-File Coverage Floor for `issue-lifecycle.ts`

### Overview
Extend the FLOORS table in `scripts/coverage-gate.mjs` to enforce ≥95% line coverage on the new module.

### Changes Required
**File**: `scripts/coverage-gate.mjs` (line 12–14)

```javascript
const FLOORS = {
  "src/engine/triage.ts": 95,
  "src/engine/issue-lifecycle.ts": 95,
};
```

### Success Criteria
- [ ] `npm run check:coverage` passes with the new entry present
- [ ] Removing a test would cause `check:coverage` to fail (floor is load-bearing)

---

## SPEC Acceptance Traceability

The SPEC has no formal `## Acceptance Criteria` section — it states scope as a single paragraph. Implied acceptance bullets are enumerated below:

| SPEC Acceptance Bullet (verbatim / implied) | Covering Task | Notes |
|---|---|---|
| `terminalDrain` extracted from `cli.ts` → `src/engine/issue-lifecycle.ts` | Task 1, Task 2 | Task 1 creates module; Task 2 removes definition from cli.ts |
| Import wired back in `cli.ts` | Task 2 | `import { terminalDrain } from "./engine/issue-lifecycle.ts"` added |
| `tests/engine/issue-lifecycle.test.ts` added covering happy path | Task 3 | Test 1 verifies happy path end-to-end |
| `tests/engine/issue-lifecycle.test.ts` added covering `mutateFrontmatter` fallback | Task 3 | Test 2 uses non-existent todoPath to trigger fallback |
| No behavior changes — pure extraction | Task 1, Task 2 | Body copied verbatim; call sites unchanged |

---

## Testing Strategy

### Unit Tests
- **Happy path**: real temp dir, real `writeQueue`, real `parseFrontmatter` — no stubs. Verifies file moved, frontmatter stamped, events emitted.
- **Fallback path**: same setup but no todo file written. Verifies `mutateFrontmatter` ENOENT triggers fallback branch, `drain_error` field present, `drain_warning` event emitted.
- **No mocking** of any module — real fs ops throughout.

### Integration / E2E Tests
- Existing `tests/cli/halt.test.ts`, `tests/cli/queue-drain.test.ts` continue to exercise `terminalDrain` indirectly through the CLI. These passing unchanged confirms no behavioral regression.

## Risk Assessment
- **Import prune removes wrong symbol**: `parseFrontmatter` is used at lines 275 and 406 in `cli.ts` — must not be removed. Typecheck catches this immediately.
- **`.ts` vs `.js` extension in new module imports**: all engine modules use `.ts`; following the pattern exactly avoids the extension mismatch bug seen in cycle 0112 (obs 1256/1257).
- **Fallback test assumes `mutateFrontmatter` throws on missing file**: depends on `mutateFrontmatter` calling `readFile` internally. If implementation differs, test design needs adjustment — but RESEARCH confirms this expectation.
```
