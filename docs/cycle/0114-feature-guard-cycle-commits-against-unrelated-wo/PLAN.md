# Implementation Plan: Cycle 0114

## Overview
Add a commit scope guard to `commitCycle()` that reads a `## Touched Files` YAML list from BUILD.md and aborts with `scope_violation` if the working tree contains dirty tracked files outside that list. Guard is a no-op when BUILD.md or the section is absent.

## Current State (from Research)

- `CommitResult` in `src/engine/commit-cycle.ts:8–11` — three variants today; needs fourth `scope_violation` variant.
- `commitCycle()` at line 129 calls `stageFiles()` unconditionally — guard inserts before this.
- `spawnGit()` at lines 26–34 — reuse pattern for scope guard's `git status` call.
- `stageFiles()` uses `git status --porcelain --untracked-files=all`; the guard uses `--porcelain` only (no `--untracked-files=all`) and skips `??` entries — targets tracked-file drift only.
- `isDenied()` at lines 16–24 — denied files are exempt from scope check (never staged anyway).
- BUILD.md location: `docs/cycle/<cycleId>-*/BUILD.md` — resolved via `readdir` + prefix match (no glob import needed).
- `tests/engine/commit-cycle.test.ts` — 13 existing tests; `setupRepo`, `writeFakeBin`, `fakeEnv` helpers reused.
- `scripts/coverage-gate.mjs` — `commit-cycle.ts` not in FLOORS table yet; must add floor at 95%.
- Build prompt output block at `src/defaults/prompts/build.md:66–81` — add `## Touched Files` requirement here.
- `docs/ENGINE.md:90–114` — "Engine-managed commit lifecycle" section; add scope guard subsection after line 114.

## Open Questions Resolved

1. **BUILD.md locating**: `readdir(join(repoRoot, "docs/cycle"))` + find entry starting with `${cycleId}-`. No `glob` import needed.
2. **Denylist interaction**: `isDenied()` filters before scope check — denied files are exempt. Requiring them in `## Touched Files` would be surprising.
3. **`git status` flags**: `--porcelain` only; skip `??` lines (new untracked files are a separate concern; regression scenario uses modified tracked file).
4. **`scope_violation` in cli.ts**: Existing `cr.status === "failed"` branch at lines 255 and 362 covers all `failed` variants — no cli.ts changes needed.

## Desired End State

- `parseTouchedFiles(buildMdPath)` and `scopeGuard(repoRoot, cycleId, envExtra)` exported from `src/engine/commit-cycle.ts`.
- `CommitResult` has a `scope_violation` variant with `blockedFiles: string[]`.
- `commitCycle()` calls `scopeGuard` before `stageFiles()` and returns `scope_violation` if blocked.
- Build prompt instructs agents to append `## Touched Files` YAML list to BUILD.md output.
- `scripts/coverage-gate.mjs` enforces `commit-cycle.ts` ≥ 95%.
- `docs/ENGINE.md` documents the scope guard behavior.
- All 13+ tests pass; `commit-cycle.ts` line coverage does not fall below 95%.

## What We're NOT Doing

- No stash/quarantine of blocked files — guard fails loudly, human decides.
- No retroactive fix of PR #37 from cycle 0029.
- No `## Touched Files` in quickfix/document prompts — guard no-ops safely.
- No separate log event for `scope_violation` in cli.ts — existing failure path sufficient.
- No changes to quickfix/document/e2e-tests workflows.
- No changes to `CommitConfig` type or push logic.

## Implementation Approach

All implementation lands in `src/engine/commit-cycle.ts` as two new exported pure functions (`parseTouchedFiles`, `scopeGuard`) plus a four-line wire-up in `commitCycle()`. Tests go in the existing `tests/engine/commit-cycle.test.ts`. Build prompt update goes in `src/defaults/prompts/build.md` followed by `npm run sync-defaults`. Coverage gate gets one new FLOORS entry. ENGINE.md gets a prose subsection.

---

## Task 1: Implement parseTouchedFiles, scopeGuard, and CommitResult extension

### Overview
Add the two new functions and extend `CommitResult`. Wire `scopeGuard` into `commitCycle()` before `stageFiles()`.

### Changes Required

**File**: `src/engine/commit-cycle.ts`

**1a. Add `readdir` to imports** (line 3):
```typescript
import { readFile, readdir } from "node:fs/promises";
```

**1b. Extend `CommitResult`** (lines 8–11):
```typescript
export type CommitResult =
  | { status: "ok"; sha: string }
  | { status: "skipped"; reason: "nothing_to_commit" }
  | { status: "failed"; reason: "commit_failed" | "push_failed"; attempt?: number }
  | { status: "failed"; reason: "scope_violation"; blockedFiles: string[] };
```

**1c. Add `parseTouchedFiles`** (new function after `isDenied`, before `spawnGit`):
```typescript
export async function parseTouchedFiles(buildMdPath: string): Promise<string[] | null> {
  let text: string;
  try {
    text = await readFile(buildMdPath, "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return null;
  const files: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(l);
    if (m) files.push(m[1].trim());
  }
  return files;
}
```

**1d. Add `scopeGuard`** (new function after `parseTouchedFiles`):
```typescript
export async function scopeGuard(
  repoRoot: string,
  cycleId: string,
  envExtra?: Record<string, string>,
): Promise<string[]> {
  let buildMdPath: string | null = null;
  try {
    const entries = await readdir(join(repoRoot, "docs/cycle"));
    const match = entries.find((e) => e.startsWith(`${cycleId}-`));
    if (match) buildMdPath = join(repoRoot, "docs/cycle", match, "BUILD.md");
  } catch { /* docs/cycle missing — no-op */ }

  if (!buildMdPath) return [];
  const touched = await parseTouchedFiles(buildMdPath);
  if (touched === null) return [];

  const touchedSet = new Set(touched);
  const status = spawnGit(["status", "--porcelain"], repoRoot, envExtra);
  const blocked: string[] = [];
  for (const raw of status.stdout.split("\n")) {
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
    if (!touchedSet.has(p)) blocked.push(p);
  }
  return blocked;
}
```

**1e. Wire into `commitCycle()`** — insert before the `stageFiles` call at line 129:
```typescript
const blockedFiles = await scopeGuard(repoRoot, opts.cycleId, envExtra);
if (blockedFiles.length > 0) return { status: "failed", reason: "scope_violation", blockedFiles };
const hasChanges = await stageFiles(repoRoot, envExtra);
```

### Success Criteria
- [ ] `tsc --noEmit` passes with the new `CommitResult` union member
- [ ] `parseTouchedFiles` and `scopeGuard` are exported (importable by tests)
- [ ] Build compiles: `npm run build`

---

## Task 2: Write tests (unit + integration + regression)

### Overview
Add tests for `parseTouchedFiles`, `scopeGuard`, and the `commitCycle` integration path covering `scope_violation`. All in `tests/engine/commit-cycle.test.ts`.

### Changes Required

**File**: `tests/engine/commit-cycle.test.ts`

Import the two new functions:
```typescript
import { commitCycle, buildClosesBlock, parseTouchedFiles, scopeGuard } from "../../src/engine/commit-cycle.ts";
```

**2a. `parseTouchedFiles` unit tests** (3 tests):
- Absent file path → returns `null`
- File exists, no `## Touched Files` section → returns `null`
- File with section → returns `["src/foo.ts", "src/bar.ts"]`

Use `mkdtemp` + write temp files. No git repo needed.

**2b. `scopeGuard` unit tests** (3 tests):
- No `docs/cycle/` dir (no-op): returns `[]`
- BUILD.md present, `## Touched Files` lists `src/foo.ts`, working tree clean → returns `[]`
- BUILD.md present, `## Touched Files` lists `src/foo.ts`, working tree dirty on `README.md` → returns `["README.md"]`

Use `setupRepo()` + fake git shimming via `writeFakeBin`/`fakeEnv`.

**2c. `commitCycle` integration — scope_violation path** (1 test):
- Temp repo; `docs/cycle/0114-feature-test/BUILD.md` with `## Touched Files` listing `src/foo.ts`; `README.md` modified in working tree
- Fake git `status --porcelain` shim returns `" M README.md\n"`
- Assert `commitCycle` returns `{ status: "failed", reason: "scope_violation", blockedFiles: ["README.md"] }`
- Assert fake git `add` was NOT called (stageFiles not reached)

**2d. `commitCycle` clean path unchanged** (1 test):
- BUILD.md with `## Touched Files: ["README.md"]`; only `README.md` dirty
- Existing commit path runs normally → `{ status: "ok", sha: <sha> }`

**2e. Regression test** (1 test, real git repo, no fake bins):
- `mkdtemp` + `git init --initial-branch=master`
- Create and commit `src/foo.ts` and `README.md`
- Write `docs/cycle/0099-feature-test/BUILD.md` with `## Touched Files\n- src/foo.ts`
- Modify `README.md` in working tree (echo change)
- Call `commitCycle(repoRoot, { cycleId: "0099", ... })`
- Assert result is `{ status: "failed", reason: "scope_violation", blockedFiles: ["README.md"] }`

### Success Criteria
- [ ] All new tests pass: `npm test`
- [ ] All 13 existing tests still pass
- [ ] `commit-cycle.ts` line coverage remains ≥ 95% after `npm run test:coverage`

---

## Task 3: Update build prompt

### Overview
Instruct the build agent to append a `## Touched Files` YAML list to BUILD.md output. Then sync to `.cycle/`.

### Changes Required

**File**: `src/defaults/prompts/build.md`

In the `## Output` section (starting line 66), add a new bullet to the "output a one-paragraph summary" list. Insert before the final line about "The engine captures stdout":

```markdown
- The `## Touched Files` YAML list: every file you created, modified, or deleted — exact repo-relative paths, no globs. Format:

  ```
  ## Touched Files
  - src/engine/commit-cycle.ts
  - tests/engine/commit-cycle.test.ts
  ```
```

**Then run**: `npm run sync-defaults`

This propagates the change to `.cycle/prompts/build.md`.

### Success Criteria
- [ ] `src/defaults/prompts/build.md` contains `## Touched Files` instruction
- [ ] `.cycle/prompts/build.md` matches `src/defaults/prompts/build.md` (sync successful)
- [ ] `tests/defaults/scripts.test.ts` (or equivalent sync test) passes

---

## Task 4: Add coverage gate floor for commit-cycle.ts

### Overview
Enforce `commit-cycle.ts` line coverage ≥ 95% via the coverage gate script.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

Extend the `FLOORS` table (lines 12–15):
```javascript
const FLOORS = {
  "src/engine/triage.ts": 95,
  "src/engine/issue-lifecycle.ts": 95,
  "src/engine/commit-cycle.ts": 95,
};
```

### Success Criteria
- [ ] `npm run check:coverage` passes with the new floor entry
- [ ] `commit-cycle.ts` coverage is reported and ≥ 95%

---

## Task 5: Update ENGINE.md documentation

### Overview
Add a scope guard subsection under "Engine-managed commit lifecycle" in `docs/ENGINE.md`.

### Changes Required

**File**: `docs/ENGINE.md`

Append after line 114 (end of "Engine-managed commit lifecycle" section):

```markdown
**Scope guard** (`parseTouchedFiles` / `scopeGuard` in `src/engine/commit-cycle.ts`): Before `stageFiles()` runs, `commitCycle()` calls `scopeGuard(repoRoot, cycleId)` which:
1. Locates `docs/cycle/<cycleId>-*/BUILD.md` via `readdir` + prefix match.
2. Calls `parseTouchedFiles(buildMdPath)` to extract the `## Touched Files` YAML list.
3. Runs `git status --porcelain` and collects dirty tracked-file paths not in the list (denylist-exempt files skipped).
4. Returns the blocked file list. If non-empty, `commitCycle()` returns `{ status: "failed", reason: "scope_violation", blockedFiles }` — `stageFiles()` is never called.

Guard is a **no-op** when BUILD.md is absent or has no `## Touched Files` section (pre-existing cycles, quickfix/document workflows). Blocked-file errors are surfaced via the `CommitResult` return value; `cli.ts` routes them through the standard retry/terminal-drain path.

**BUILD.md contract**: Build agents must append a `## Touched Files` YAML list (exact repo-relative paths, no globs) to their stdout output. The engine writes this to `docs/cycle/<cycleId>-*/BUILD.md`. The scope guard reads it at commit time.
```

### Success Criteria
- [ ] `docs/ENGINE.md` contains the scope guard subsection
- [ ] Prose is accurate against the implementation

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] parseTouchedFiles returns null when BUILD.md absent or section missing; returns file list when section present.` | Task 1, Task 2a | Implemented in Task 1; unit-tested in Task 2a |
| `[ ] scopeGuard returns empty array when touched-files list is null (no-op).` | Task 1, Task 2b | Guard returns `[]` when parseTouchedFiles returns null |
| `[ ] scopeGuard returns ["README.md"] when touched-files is ["src/foo.ts"] and git status shows README.md dirty.` | Task 1, Task 2b | Unit test in Task 2b (test 3) |
| `[ ] commitCycle() returns { status: "failed", reason: "scope_violation", blockedFiles: ["README.md"] } in the regression scenario.` | Task 1, Task 2e | Regression test uses real git repo |
| `[ ] commitCycle() proceeds normally when working tree contains only files enumerated in ## Touched Files.` | Task 2d | Integration test covering clean path |
| `[ ] CommitResult type updated; TypeScript tsc --noEmit passes.` | Task 1 | Fourth union member added |
| `[ ] Build prompt instructs agent to populate ## Touched Files with exact file paths.` | Task 3 | build.md + sync-defaults |
| `[ ] All existing tests still pass.` | Task 2 | Verified via npm test |
| `[ ] commit-cycle.ts per-file line coverage ≥ 95% (current 99.35% — must not regress).` | Task 4 | Floor added to coverage-gate.mjs |
| `[ ] Aggregate line ≥ 95%, branch ≥ 75%, function ≥ 90%.` | Task 2 | Verified via npm run test:coverage |

---

## Testing Strategy

### Unit Tests
- `parseTouchedFiles`: absent path (ENOENT catch → null), present file no section (null), present file with section (array). No git repo needed — pure file I/O.
- `scopeGuard`: use `setupRepo()` + `writeFakeBin`/`fakeEnv` for git status shims. Test null (no BUILD.md), clean (touched matches dirty), blocked (dirty outside list).
- `commitCycle` scope_violation path: fake git shim returns `" M README.md\n"` for status; assert `git add` not called.

### Integration / E2E Tests
- Regression test (Task 2e): real `git init` temp repo, real file mutations, real `git status` — no fake bins. Calls `commitCycle` and asserts `scope_violation` result. This is the primary end-to-end test for the guard.

## Risk Assessment

- **`readdir` throws if `docs/cycle/` absent**: Caught in try/catch → returns `[]` (no-op). Safe.
- **Multiple directories matching `${cycleId}-*`**: Impossible by design (cycleId is a monotonic 4-digit number, allocated uniquely). `entries.find()` returns first match.
- **`parseTouchedFiles` misparses section boundary**: Section ends on next `##` header or EOF. Covered by unit test with multi-section BUILD.md.
- **TypeScript narrowing on two `failed` variants**: Narrowing on `cr.status === "failed"` produces a union of both failed variants; `blockedFiles` only safe after further narrowing on `cr.reason === "scope_violation"`. CLI doesn't narrow further — safe since it only routes on `status`.
- **sync-defaults forgetting**: Task 3 must run `npm run sync-defaults` explicitly; `tests/defaults/scripts.test.ts` will catch the desync if forgotten.
