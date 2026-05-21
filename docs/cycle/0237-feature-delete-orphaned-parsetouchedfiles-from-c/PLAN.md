# Implementation Plan: Cycle 0237

## Overview

Delete the orphaned `parseTouchedFiles` export from `src/engine/commit-cycle.ts` and its three paired unit tests from `tests/engine/commit-cycle.test.ts`. This is a pure deletion cycle — no replacement code, no new tests.

## Current State (from Research)

- `parseTouchedFiles` occupies lines 15–33 of `src/engine/commit-cycle.ts`. It has zero production callers in `src/`; `commitCycle` reads `touched.json` directly via `opts.artifactDir` (post-0236).
- Three unit tests at `tests/engine/commit-cycle.test.ts:424–463` exercise only `parseTouchedFiles`. The named import at line 7 includes it in the destructure `{ commitCycle, buildClosesBlock, parseTouchedFiles }`.
- The `readFile` import at `src/engine/commit-cycle.ts:3` is still needed by `commitCycle` and `buildClosesBlock` after deletion — it stays.
- Coverage floor for `src/engine/commit-cycle.ts` is 95% line. Removing the function and its paired tests together leaves the ratio intact.
- Current test count: 21. After deletion: 18.

## Desired End State

- `grep -r "parseTouchedFiles" src/` returns no matches.
- `grep -r "parseTouchedFiles" tests/` returns no matches.
- `npm test` exits 0 with 18 tests in `commit-cycle.test.ts`.
- `npm run test:coverage && npm run check:coverage` exits 0; `src/engine/commit-cycle.ts` ≥ 95% line.
- `npm run check:invariants` exits 0.
- `npm run typecheck` exits 0.

## What We're NOT Doing

- No replacement BUILD.md parser of any kind.
- No changes to `touched.json` logic or `commitCycle`.
- No removal of other dead code discovered incidentally.
- No new tests.

## Implementation Approach

Two-file surgical deletion. Delete the function block from source, update the import destructure in the test file, delete the three test cases. Order: source first, then tests — both changes are in one logical commit.

---

## Task 1: Delete `parseTouchedFiles` from source

### Overview

Remove the exported function body (lines 15–33) from `src/engine/commit-cycle.ts`. The blank line separating it from `spawnGit` at line 35 is also removed so there is no double-blank gap.

### Changes Required

**File**: `src/engine/commit-cycle.ts`

Delete lines 15–33 (plus the trailing blank line at 34 that served as separator):

```
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

After deletion, line 15 becomes `function spawnGit(`. The `readFile` import at line 3 stays (used by `commitCycle` and `buildClosesBlock`).

### Success Criteria

- [ ] `grep "parseTouchedFiles" src/engine/commit-cycle.ts` returns no matches.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.

---

## Task 2: Remove `parseTouchedFiles` from test import and delete its three test cases

### Overview

Two sub-changes in `tests/engine/commit-cycle.test.ts`:

1. Remove `parseTouchedFiles` from the named import destructure at line 7.
2. Delete the comment header and three test cases at lines 424–463.

### Changes Required

**File**: `tests/engine/commit-cycle.test.ts`

**Sub-change A — import line (line 7):**

Before:
```ts
import { commitCycle, buildClosesBlock, parseTouchedFiles } from "../../src/engine/commit-cycle.ts";
```

After:
```ts
import { commitCycle, buildClosesBlock } from "../../src/engine/commit-cycle.ts";
```

**Sub-change B — delete lines 424–463 inclusive:**

```
// --- parseTouchedFiles unit tests ---

test("parseTouchedFiles — absent file returns null", async () => { … });

test("parseTouchedFiles — file exists, no Touched Files section returns null", async () => { … });

test("parseTouchedFiles — section present returns file list", async () => { … });
```

After deletion, `// --- commitCycle commit.scope_warning tests ---` (currently line 465) becomes the next line after line 422's closing `});`.

### Success Criteria

- [ ] `grep "parseTouchedFiles" tests/engine/commit-cycle.test.ts` returns no matches.
- [ ] `npm test` exits 0; commit-cycle test file reports 18 passing tests (down from 21).

---

## Task 3: Verify all quality gates

### Overview

Run the full gate sequence to confirm deletion is complete and coverage floors are intact.

### Changes Required

No code changes. Run commands only:

```
grep -r "parseTouchedFiles" src/
grep -r "parseTouchedFiles" tests/
npm test
npm run test:coverage && npm run check:coverage
npm run check:invariants
npm run typecheck
```

### Success Criteria

- [ ] Both `grep` commands return empty output (exit 1 is acceptable — zero matches is the goal).
- [ ] `npm test` exits 0.
- [ ] `npm run test:coverage && npm run check:coverage` exits 0; `src/engine/commit-cycle.ts` line coverage ≥ 95%.
- [ ] `npm run check:invariants` exits 0.
- [ ] `npm run typecheck` exits 0.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`grep -r "parseTouchedFiles" src/\` returns no matches.` | Task 1, Task 3 | Task 1 deletes the symbol; Task 3 verifies via grep |
| `[ ] \`grep -r "parseTouchedFiles" tests/\` returns no matches.` | Task 2, Task 3 | Task 2 removes import + tests; Task 3 verifies via grep |
| `[ ] \`npm test\` exits 0 with all tests passing.` | Task 3 | Full suite run after both deletions |
| `[ ] \`npm run test:coverage && npm run check:coverage\` exits 0 with per-file floor for \`src/engine/commit-cycle.ts\` still met (≥ 95% line coverage).` | Task 3 | Paired function+test deletion keeps ratio intact |
| `[ ] \`npm run check:invariants\` exits 0.` | Task 3 | No structural invariants touch parseTouchedFiles; expected clean |
| `[ ] \`npm run typecheck\` exits 0 with no warnings.` | Task 1, Task 3 | Import removal in Task 2 satisfies TS; Task 3 confirms |

---

## Testing Strategy

### Unit Tests

No new tests written. This cycle is deletion-only per SPEC.

### Post-Deletion Verification

- `npm test` confirms no other test file imported or called `parseTouchedFiles` (would surface as a runtime or parse error).
- `npm run test:coverage` confirms the 95% line floor for `src/engine/commit-cycle.ts` is still met after removing both the 19-line function and its 3 test cases.

## Risk Assessment

- **Coverage floor drops below 95%**: Low risk. The 19 deleted lines in source were fully covered by the 3 deleted tests. Removing both sides together keeps the uncovered/total ratio stable. Verified by running `npm run test:coverage` in Task 3.
- **Hidden caller of `parseTouchedFiles` in tests/**: Already ruled out by research grep. `npm test` would surface any missed reference as a `ReferenceError` at runtime.
- **Double-blank gap in source after deletion**: Cosmetic only; not a correctness risk. Can be cleaned if linter flags it, but no linter currently enforces this.
