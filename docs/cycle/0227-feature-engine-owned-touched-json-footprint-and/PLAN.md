# Implementation Plan: Cycle 0227

## Overview
This cycle adds engine-computed `touched.json` footprint tracking (accumulating git deltas around `build`/`fix` steps), demotes the blocking scope guard in `commit-cycle.ts` to a non-blocking `commit.scope_warning` log event, and removes the `scopeGuardViolations` counter and `commit-scope-guard-loop` halt path from `cli.ts`.

## Current State (from Research)
- `scopeGuard()` at `commit-cycle.ts:35–71` reads `BUILD.md`'s `## Touched Files` section and blocks commits when staged `src/`/`scripts/` files are absent. `commitCycle` calls it at line 176 and returns `scope_violation` early if any violations found.
- `cli.ts:177` initializes `scopeGuardViolations = new Map<string, number>()`. Two sites (resume path at lines 380–391, main drain at lines 496–507) check `scope_violation` results, increment the counter, and emit `engine.paused { reason: "commit-scope-guard-loop" }` after two violations.
- `run-cycle.ts:292–296` captures a pre-snapshot only for the `documentation` step. `RESET_ELIGIBLE_STEPS = Set(["build", "fix"])` at line 27 already identifies the right steps for footprint capture.
- `appendDocumentationPaths` (`run-cycle.ts:40–108`) is the exact pre/post snapshot diff pattern to reuse: parse both snapshots, compute set difference, filter `isDenied`, write.
- `artifactDir` resolves to `docs/cycle/<cycleId>-<workflow>-<slug>/` and is live throughout the step loop in `runCycle`. `commitCycle` already scans `docs/cycle/<cycleId>-*` to find this dir.
- `commitCycle` has no `Logger` parameter. For `commit.scope_warning` to reach `.cycle/log.jsonl`, a `log` field must be added to `CommitCycleOpts`.

## Desired End State
- `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json` contains `{ "files": [...] }` — sorted, deduplicated, repo-root-relative paths dirtied by engine-observed git deltas during `build`/`fix` steps.
- `commitCycle` never returns `scope_violation`. If staged `src/`/`scripts/` files are absent from `touched.json`, it emits `commit.scope_warning` via `opts.log` and continues.
- `cli.ts` contains no reference to `scopeGuardViolations`, `commit-scope-guard-loop`, or `"scope-guard-loop"`.
- `CommitResult` type has no `scope_violation` variant.
- `tests/cli/scope-guard-halt.test.ts` is deleted.
- All tests pass, typecheck clean, per-file coverage floors met.

## What We're NOT Doing
- Creating a `.cycle/artifacts/<cycle-id>/` directory — `touched.json` goes into the existing `artifactDir` (`docs/cycle/<cycleId>-<workflow>-<slug>/`).
- Deleting `parseTouchedFiles` — still exported, still has test coverage; simply no longer called from `commitCycle`.
- Making `final_fix` steps append to `touched.json` (redesign-06).
- Making the reflection step consume `commit.scope_warning` (redesign-07).
- Changing stale-dist logic, branch naming, or any other part of the commit path beyond the guard.

## Implementation Approach
Four vertical slices, each delivering testable functionality. Slices 1 and 2 are independent (no shared type changes between them). Slice 3 requires Slice 2's `CommitCycleOpts` change to compile. Slice 4 spans all three.

---

## Task 1: `touched.json` accumulation in `run-cycle.ts`

### Overview
Add `accumulateTouchedFiles` helper that captures a post-snapshot, diffs against a pre-snapshot, and writes the union of dirtied files to `<artifactDir>/touched.json`. Extend the pre-snapshot capture block to cover `build`/`fix` in addition to `documentation`. Call the helper after each successful `build`/`fix` step.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**New helper** — insert immediately after `appendDocumentationPaths` (after line 108), before `shouldSkipForArtifact`:

```typescript
async function accumulateTouchedFiles(
  repoRoot: string,
  artifactDir: string,
  preSnapshot: string,
): Promise<void> {
  const prePaths = new Set<string>();
  for (const raw of preSnapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    prePaths.add(p);
  }

  const post = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  const newFiles: string[] = [];
  for (const raw of (post.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p)) continue;
    if (!prePaths.has(p)) newFiles.push(p);
  }

  const touchedPath = join(artifactDir, "touched.json");
  let existing: string[] = [];
  try {
    const raw = await readFile(touchedPath, "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) existing = parsed.files as string[];
  } catch { /* absent or corrupt — start fresh */ }

  const merged = Array.from(new Set([...existing, ...newFiles])).sort();
  await writeFile(touchedPath, JSON.stringify({ files: merged }, null, 2) + "\n", "utf8");
}
```

**Pre-snapshot capture** — extend the guard at `run-cycle.ts:293` from `documentation`-only to include `RESET_ELIGIBLE_STEPS`:

```typescript
// Change:
if (step.name === "documentation") {
// To:
if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name)) {
```

The `preSnapshot` variable is already declared as `let preSnapshot = ""` at line 292; the same variable serves both purposes since these are mutually exclusive step names.

**Post-step accumulation** — add inside the `if (step.agent !== "bash")` block (after the `documentation` block that ends at line 370, before the closing `}`):

```typescript
if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name)) {
  try {
    await accumulateTouchedFiles(repoRoot, artifactDir, preSnapshot);
  } catch { /* best-effort; never fail the cycle */ }
}
```

No new imports required — `readFile`, `writeFile`, `join`, `spawnSync`, `isDenied` are all already imported.

### Success Criteria
- [ ] `src/engine/run-cycle.ts` typechecks clean
- [ ] After a single `build` step, `<artifactDir>/touched.json` exists with a `files` array containing only files dirtied during that step
- [ ] Files dirty before the step starts are excluded from `touched.json`
- [ ] Two sequential steps dirtying disjoint files → `touched.json.files` is their sorted union

---

## Task 2: Demote scope guard in `commit-cycle.ts`

### Overview
Add `log?: Logger` to `CommitCycleOpts`. Remove the blocking `scopeGuard` call and `scope_violation` early-return. Replace with a non-blocking check: read `touched.json` from the cycle's artifact dir, compare staged `src/`/`scripts/` files, emit `commit.scope_warning` if any are absent, then always continue to `stageFiles`. Delete the `scopeGuard` function. Remove the `scope_violation` variant from `CommitResult`.

### Changes Required

**File**: `src/engine/commit-cycle.ts`

**New import** — add `Logger` type:
```typescript
import type { Logger } from "./log.ts";
```

**`CommitResult` type** (line 9–13) — remove the `scope_violation` variant:
```typescript
export type CommitResult =
  | { status: "ok"; sha: string }
  | { status: "skipped"; reason: "nothing_to_commit" }
  | { status: "failed"; reason: "commit_failed" | "push_failed"; attempt?: number };
```

**`commitCycle` signature** — add `log` to opts:
```typescript
export async function commitCycle(
  repoRoot: string,
  opts: {
    cycleId: string;
    title: string;
    issueId?: string;
    config: CommitConfig;
    baseBranch: string;
    envExtra?: Record<string, string>;
    log?: Logger;
  },
): Promise<CommitResult> {
```

**Delete `scopeGuard` function** — remove lines 35–71 entirely.

**`commitCycle` body** — replace lines 175–177 (the `scopeGuard` call and early-return) with:

```typescript
const { envExtra } = opts;

// Read touched.json from cycle artifact dir (fallback: empty set)
let touchedFiles = new Set<string>();
try {
  const entries = await readdir(join(repoRoot, "docs/cycle"));
  const match = entries.find((e) => e.startsWith(`${opts.cycleId}-`));
  if (match) {
    const raw = await readFile(join(repoRoot, "docs/cycle", match, "touched.json"), "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) touchedFiles = new Set(parsed.files as string[]);
  }
} catch { /* docs/cycle absent, touched.json absent, or corrupt */ }

// Warn (non-blocking) about src/ and scripts/ files absent from touched.json
const statusOut = spawnGit(["status", "--porcelain"], repoRoot, envExtra);
const warnFiles: string[] = [];
for (const raw of statusOut.stdout.split("\n")) {
  if (!raw) continue;
  const xy = raw.slice(0, 2);
  if (xy === "??" || xy[0] === "D" || xy[1] === "D") continue;
  let p = raw.slice(3);
  if (xy[0] === "R" || xy[0] === "C") {
    const arrow = p.lastIndexOf(" -> ");
    if (arrow !== -1) p = p.slice(arrow + 4);
  }
  p = p.replace(/^"/, "").replace(/"$/, "");
  if (isDenied(p)) continue;
  if (!p.startsWith("src/") && !p.startsWith("scripts/")) continue;
  if (!touchedFiles.has(p)) warnFiles.push(p);
}
if (warnFiles.length > 0) {
  await opts.log?.emit("commit.scope_warning", { cycle_id: opts.cycleId, files: warnFiles });
}
```

Existing imports (`readFile`, `readdir`, `spawnGit`, `isDenied`) are already present. `Logger` type is newly imported.

`parseTouchedFiles` (lines 15–33) stays in place — exported, has tests, no callers inside `commitCycle` after this change.

### Success Criteria
- [ ] `CommitResult` has no `scope_violation` variant
- [ ] `scopeGuard` function deleted from `commit-cycle.ts`
- [ ] `commitCycle` never returns early on footprint mismatch
- [ ] When a staged `src/` file is absent from `touched.json`, `commit.scope_warning` is emitted and commit proceeds
- [ ] When all staged `src/` files are in `touched.json`, no `commit.scope_warning` is emitted
- [ ] `src/engine/commit-cycle.ts` typechecks clean

---

## Task 3: Remove halt counter from `cli.ts`

### Overview
Delete `scopeGuardViolations` Map and all four references to it. Remove the two `engine.paused { reason: "commit-scope-guard-loop" }` emission blocks. Remove `"scope-guard-loop"` from `ResumeOutcome`. Remove the resume-result `scope-guard-loop` dispatch branch. Thread `log` into both `commitCycle` call sites.

### Changes Required

**File**: `src/cli.ts`

**`ResumeOutcome` type** (line 33) — remove `"scope-guard-loop"`:
```typescript
type ResumeOutcome = "ok" | "retry" | "terminal" | "skipped";
```

**`scopeGuardViolations` declaration** (line 177) — delete entirely:
```typescript
// Delete this line:
const scopeGuardViolations = new Map<string, number>();
```

**Resume path `commitCycle` call** (lines 373–402) — add `log` field; remove the `scope_violation` block (lines 380–391) and the `scopeGuardViolations.delete` at line 401:
```typescript
const cr = await commitCycle(cwd, {
  cycleId: tail.cycleId,
  title: tail.title,
  issueId: tail.issueId,
  config: cfg.engine.commit,
  baseBranch: cfg.engine.base_branch,
  log,   // ← add
});
// Remove the if (cr.status === "failed" && cr.reason === "scope_violation") block entirely
// Remove: scopeGuardViolations.delete(tail.cycleId);
```

**Resume result dispatch** (lines 429–431) — remove the `scope-guard-loop` branch:
```typescript
// Delete:
} else if (result.outcome === "scope-guard-loop") {
  halted = true;
}
```

**Main drain loop `commitCycle` call** (lines 489–525) — same treatment: add `log`, remove the `scope_violation` block (lines 496–508), remove `scopeGuardViolations.delete` at line 525:
```typescript
const cr = await commitCycle(cwd, {
  cycleId,
  title: row.title,
  issueId: row.id,
  config: cfg!.engine.commit,
  baseBranch: cfg!.engine.base_branch,
  log,   // ← add
});
// Remove the if (cr.status === "failed" && cr.reason === "scope_violation") block entirely
// Remove: scopeGuardViolations.delete(cycleId);
```

### Success Criteria
- [ ] No reference to `scopeGuardViolations`, `commit-scope-guard-loop`, or `"scope-guard-loop"` anywhere in `src/`
- [ ] `ResumeOutcome` type has four members: `"ok" | "retry" | "terminal" | "skipped"`
- [ ] Both `commitCycle` call sites pass `log`
- [ ] `src/cli.ts` typechecks clean

---

## Task 4: Update tests

### Overview
Delete `tests/cli/scope-guard-halt.test.ts` entirely (all three tests assert the now-deleted `engine.paused { reason: "commit-scope-guard-loop" }` behavior). In `commit-cycle.test.ts`, delete the two `scope_violation` result tests and the `scopeGuard` function tests; add three new tests for the non-blocking warning logic. Create `tests/engine/run-cycle.touched-json.test.ts` with two tests for accumulation.

### Changes Required

**File**: `tests/cli/scope-guard-halt.test.ts`
- **Delete the file entirely.**

**File**: `tests/engine/commit-cycle.test.ts`
- **Delete** the test at line 566: `"commitCycle — scope_violation: stageFiles never called"` (lines 566–604)
- **Delete** the `scopeGuard`-only tests (any test that calls `scopeGuard(...)` directly or asserts `scope_violation` result)
- **Keep** all `parseTouchedFiles` tests — the function is still exported and tested
- **Add** three new tests after the existing `commitCycle` clean-scope test:

```
test("commitCycle — out-of-footprint: emits commit.scope_warning, commit proceeds")
  Setup:
  - Real git repo via setupRepo(root)
  - mkdir docs/cycle/0099-feature-test/
  - Write touched.json: { "files": ["src/foo.ts"] }
  - Write and stage src/bar.ts (real file, git add)
  - Pass opts.log = await createLogger(root)
  
  Assert:
  - cr.status === "ok" or "skipped" (never "failed" with scope_violation)
  - expectExactlyOne(events, "commit.scope_warning") returns event
  - event.files includes "src/bar.ts"
  - event.files does NOT include "src/foo.ts"

test("commitCycle — in-footprint: no commit.scope_warning emitted")
  Setup:
  - Real git repo, src/foo.ts staged
  - touched.json: { "files": ["src/foo.ts"] }
  - Pass opts.log
  
  Assert:
  - events.filter(e => e.event === "commit.scope_warning").length === 0

test("commitCycle — no touched.json: emits commit.scope_warning for all staged src/ files")
  Setup:
  - Real git repo, src/bar.ts staged, no touched.json present
  - Pass opts.log
  
  Assert:
  - expectExactlyOne(events, "commit.scope_warning")
  - event.files includes "src/bar.ts"
```

Use `createLogger(root)` (imported from `src/engine/log.ts`) and read events back from `.cycle/log.jsonl` using the same pattern already in `commit-cycle.test.ts`. Use `expectExactlyOne` from `tests/helpers.ts` for exactly-once assertions per CLAUDE.md convention.

**New file**: `tests/engine/run-cycle.touched-json.test.ts`

Two integration tests modeled after `tests/engine/run-cycle.documentation.test.ts`. Use the `setupBuildDocWorkflow` helper (or inline equivalent) with a fake `claude` binary that writes a `src/` file during the step.

```
test("run-cycle touched.json: single build step accumulates dirtied files")
  Setup:
  - Workflow with one build step
  - Fake claude for build step writes src/engine/new-module.ts
  - Run runCycle(...)
  
  Assert:
  - touched.json exists in artifactDir
  - parsed.files includes "src/engine/new-module.ts"
  - parsed.files does NOT include files pre-existing before step

test("run-cycle touched.json: two sequential steps → files is sorted union")
  Setup:
  - Workflow with build step (dirties src/a.ts) then fix step (dirties src/b.ts)
  - Fake claude dispatches by step name; each writes a distinct file
  
  Assert:
  - touched.json.files === ["src/a.ts", "src/b.ts"] (sorted)
  - No duplicates
```

### Success Criteria
- [ ] `tests/cli/scope-guard-halt.test.ts` deleted
- [ ] No test references `"commit-scope-guard-loop"` or `"scope_violation"` result type
- [ ] Three new `commitCycle` warning tests pass
- [ ] Two new `touched.json` accumulation tests pass
- [ ] `npm test` passes with zero failures

---

## Task 5: Coverage floor + docs/ENGINE.md

### Overview
Add explicit `run-cycle.ts` floor to `FLOORS` table. Update `docs/ENGINE.md` with `touched.json` schema, location, accumulation semantics, and `commit.scope_warning` event shape. Note removal of blocking scope guard.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

In the `FLOORS` object/table, add:
```javascript
"src/engine/run-cycle.ts": 90,
```
(Insert alongside the other `src/engine/` entries.)

**File**: `docs/ENGINE.md`

Add a new subsection under the commit lifecycle section. Content:

```
### touched.json footprint

After each successful `build` or `fix` step, the engine captures a `git status --porcelain`
snapshot before and after the step, diffs them to identify newly-dirtied files, and
accumulates the union into `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json`.

Schema: `{ "files": string[] }` — sorted, deduplicated, repo-root-relative paths.
Accumulation: union across all `build`/`fix` steps; never overwritten within a cycle.
Files dirty before a step begins are excluded.

At commit time, `commitCycle` reads `touched.json` (falling back to an empty set if absent)
and compares staged `src/` and `scripts/` files against it. Any staged file absent from
the footprint triggers a `commit.scope_warning` log event:

  { ts, event: "commit.scope_warning", cycle_id: string, files: string[] }

The commit is never blocked. The warning is informational — consumed by future
reflection steps (redesign-07). The previous blocking `scopeGuard` and the
`commit-scope-guard-loop` halt path have been removed entirely.
```

### Success Criteria
- [ ] `npm run check:coverage` passes with `run-cycle.ts` meeting its 90% floor
- [ ] `scripts/coverage-gate.mjs` `FLOORS` table contains `src/engine/run-cycle.ts`
- [ ] `docs/ENGINE.md` documents `touched.json` schema, location, accumulation, and `commit.scope_warning` event shape

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] touched.json exists in .cycle/artifacts/<cycle-id>/ after a cycle run with at least one mutating step, containing only files dirtied by engine-observed git deltas — not agent-authored prose` | Task 1 | Location resolved to `docs/cycle/<cycleId>-<workflow>-<slug>/touched.json` (the existing `artifactDir`); `.cycle/artifacts/` does not exist in the codebase. Delta semantics are identical to SPEC intent. |
| `[ ] A commit where a src/ file is absent from touched.json succeeds and emits exactly one commit.scope_warning event with that file in the files array` | Task 2, Task 4 | Task 2 implements non-blocking warning; Task 4 asserts with `expectExactlyOne` |
| `[ ] A commit where all staged src/ files are present in touched.json emits no commit.scope_warning` | Task 2, Task 4 | Task 2 implements; Task 4 adds in-footprint test asserting zero `commit.scope_warning` events |
| `[ ] No code path in cli.ts, run-cycle.ts, or commit-cycle.ts references commit-scope-guard-loop or scopeGuardViolations after this cycle` | Task 3 | Verified post-implementation by grep; SPEC testing strategy also calls for grep-based assertion |
| `[ ] Two sequential mutating steps dirtying disjoint file sets produce a touched.json whose files is the union of both sets` | Task 1, Task 4 | Task 1 implements union logic with `Set` merge; Task 4 adds two-step accumulation test |
| `[ ] npm run test:coverage && npm run check:coverage passes with per-file floors for commit-cycle.ts and run-cycle.ts maintained` | Task 5 | Adds explicit `run-cycle.ts` floor at 90%; `commit-cycle.ts` floor is already 95% and must stay met after `scopeGuard` deletion |
| `[ ] npm run typecheck exits clean with zero warnings` | Tasks 1–3 | Typecheck verified at each task boundary |
| `[ ] All existing tests still pass` | Task 4 | `scope-guard-halt.test.ts` deleted (tests for deleted code paths); all other existing tests must still pass |

---

## Testing Strategy

### Unit Tests
- `tests/engine/commit-cycle.test.ts`: three new focused tests for warning logic. Use real git repo (`setupRepo`), real `createLogger`, write events to `.cycle/log.jsonl`, read back and assert. Use `expectExactlyOne` from `tests/helpers.ts` for `commit.scope_warning` cardinality. No mocking of the Logger — real file I/O matches anti-mock-bias policy and follows existing test patterns.
- Coverage check: deleting `scopeGuard` tests removes coverage for lines 35–71; new warning tests must cover the new `touchedFiles` load + `warnFiles` assembly logic to keep `commit-cycle.ts` at 95%.

### Integration / E2E Tests
- `tests/engine/run-cycle.touched-json.test.ts`: two integration tests using the fake-binary dispatch pattern from `run-cycle.documentation.test.ts`. Each fake `claude` script writes a specific `src/` file and exits 0. Tests verify `touched.json` content after `runCycle` completes. No mocking — real `spawnSync` git calls, real file writes.
- `tests/cli/scope-guard-halt.test.ts`: deleted entirely (three tests, all asserting deleted behavior).

## Risk Assessment
- **`touched.json` absent when `commitCycle` runs** (e.g., cycle had no `build`/`fix` steps): handled — empty `touchedFiles` set means all `src/`/`scripts/` files trigger `commit.scope_warning`, but commit always proceeds. Intentional degraded behavior, consistent with SPEC.
- **Coverage regression on `commit-cycle.ts` after `scopeGuard` deletion**: risk is real — `scopeGuard` (37 lines) and its tests are deleted together. New warning logic tests must cover the replacement code. Verify 95% floor with `npm run test:coverage` before finalizing Task 4.
- **`parseTouchedFiles` coverage**: function stays, tests stay, floor unaffected.
- **`readdir` throws when `docs/cycle/` absent in test repos**: the existing `try/catch` around the `readdir` call handles this — falls back to empty `touchedFiles` set, which is correct.
- **`docs/cycle/` scan matching wrong cycle dir**: the `.find(e => e.startsWith(...cycleId...))` pattern is identical to the deleted `scopeGuard` implementation — same correctness as before.
