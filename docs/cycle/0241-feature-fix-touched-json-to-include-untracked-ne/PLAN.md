# Implementation Plan: Cycle 0241

## Overview

Extend `parseSnapshotPaths` to emit `??`-status paths under `src/` and `scripts/`, and remove the `??` skip from the `commitCycle` scope-warning loop, so newly-created untracked files are fully tracked in `touched.json` and trigger scope warnings. Update `ENGINE.md` to describe the corrected behavior.

## Current State (from Research)

- `parseSnapshotPaths` (`src/engine/run-cycle.ts:40-55`): not exported; line 45 is `if (xy === "??") continue;` — unconditional skip for all untracked paths.
- `commitCycle` scope-warning loop (`src/engine/commit-cycle.ts:137`): `if (xy === "??" || xy[0] === "D" || xy[1] === "D") continue;` — `??` grouped with deletion skip.
- `accumulateTouchedFiles` calls `parseSnapshotPaths` at lines 107 (pre-snapshot) and 114 (post-snapshot). The pre/post diff mechanism already handles new paths correctly once `parseSnapshotPaths` emits them.
- `appendDocumentationPaths` also calls `parseSnapshotPaths` (lines 76, 84) — out of scope; the side-effect of improved accuracy there is benign.
- `ENGINE.md:167` contains a "Known limitation" block describing the `??` exclusion — must be removed.
- Existing test files: `tests/engine/run-cycle.touched-json.test.ts` (two integration tests, no `??` coverage); `tests/engine/commit-cycle.test.ts` (five scope-warning tests, no `??` coverage).
- Coverage floors: `run-cycle.ts` ≥ 90%, `commit-cycle.ts` ≥ 95%.

## Desired End State

- `parseSnapshotPaths` is `export`ed and emits `src/`- and `scripts/`-prefixed untracked paths.
- Untracked `src/`/`scripts/` files created during a build/fix step appear in `touched.json`.
- `commitCycle` emits `commit.scope_warning` for `??`-status `src/`/`scripts/` files absent from `touched.json`.
- Untracked paths outside `src/`/`scripts/` remain excluded from both.
- `npm test` passes; per-file coverage floors hold; no type errors.
- `ENGINE.md` "Known limitation" for `??` exclusion removed; footprint section updated.

## What We're NOT Doing

- Changing `stageFiles` — it already correctly handles untracked files via `--untracked-files=all`.
- Modifying `accumulateTouchedFiles` — the pre/post diff mechanism works once `parseSnapshotPaths` emits `??` paths.
- Adding tests or behavior changes for `appendDocumentationPaths` — out of scope even though it calls `parseSnapshotPaths`.
- Modifying any analytics or reflection consumers of `touched.json`.

## Implementation Approach

Both changes are surgical two-to-four line edits. The only design choice is how to test `parseSnapshotPaths`: export it for direct unit testing (chosen over indirect `runCycle` integration) because it avoids git repo setup overhead and produces faster, more targeted tests. The scope-warning `??` removal in `commit-cycle.ts` requires no special handling — after removing `??` from the skip guard, the `?` character in `xy[0]`/`xy[1]` does not trigger the rename/copy branch (`R`/`C` check), so the path falls through to the normal quote-strip and prefix-filter path cleanly.

---

## Task 1: Export and Extend `parseSnapshotPaths`

### Overview

Add `export` to `parseSnapshotPaths` and replace the unconditional `??` skip with a prefix-filtered include for `src/` and `scripts/` untracked paths.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Replace lines 40 and 45:

```typescript
// Before:
function parseSnapshotPaths(snapshot: string): Set<string> {
  ...
    if (xy === "??") continue;
```

```typescript
// After:
export function parseSnapshotPaths(snapshot: string): Set<string> {
  ...
    if (xy === "??") {
      const p = raw.slice(3).replace(/^"/, "").replace(/"$/, "");
      if (p.startsWith("src/") || p.startsWith("scripts/")) paths.add(p);
      continue;
    }
```

No other changes to the function body. The rename/copy expansion at lines 47-50 is unreachable for `??` paths (already `continue`d), so no interaction.

### Success Criteria

- [ ] `parseSnapshotPaths` is importable from test files.
- [ ] `?? src/new-file.ts` → returned set contains `src/new-file.ts`.
- [ ] `?? scripts/helper.mjs` → returned set contains `scripts/helper.mjs`.
- [ ] `?? config/foo.json` → returned set does NOT contain `config/foo.json`.
- [ ] `?? docs/something.md` → returned set does NOT contain `docs/something.md`.
- [ ] `npm run typecheck` produces no errors.

---

## Task 2: Remove `??` Skip from `commitCycle` Scope-Warning Loop

### Overview

Remove `xy === "??"` from the skip guard at `commit-cycle.ts:137`. After this change, `??` paths naturally fall through to quote-strip and prefix-filter, causing untracked `src/`/`scripts/` files absent from `touched.json` to appear in `commit.scope_warning`.

### Changes Required

**File**: `src/engine/commit-cycle.ts`

Line 137, change:

```typescript
// Before:
if (xy === "??" || xy[0] === "D" || xy[1] === "D") continue;
```

```typescript
// After:
if (xy[0] === "D" || xy[1] === "D") continue;
```

No other changes. The existing rename/copy expansion at lines 139-142 (`xy[0] === "R" || xy[0] === "C"`) does not trigger for `??` (`xy[0] === "?"`). Quote-strip at line 143 applies defensively. `isDenied` check at line 144 still applies. Prefix filter at line 145 still applies — untracked paths outside `src/`/`scripts/` remain excluded.

### Success Criteria

- [ ] `commitCycle` emits `commit.scope_warning` when git status contains `?? src/new.ts` and `touched.json` does not include `src/new.ts`.
- [ ] `commitCycle` does NOT emit `commit.scope_warning` for `?? config/settings.json`.
- [ ] Deletion skip (`D`-status) still works — verified by existing tests passing unchanged.
- [ ] `npm run typecheck` produces no errors.

---

## Task 3: Unit Tests for `parseSnapshotPaths` and Integration Test for Untracked Accumulation

### Overview

New unit test file for `parseSnapshotPaths` covering all `??` cases. New integration test in the existing touched-json test file confirming `accumulateTouchedFiles` captures an untracked (never-staged) `src/` file.

### Changes Required

**New file**: `tests/engine/run-cycle.parse-snapshot.test.ts`

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseSnapshotPaths } from "../../src/engine/run-cycle.ts";

test("parseSnapshotPaths: ?? src/ path included", () => {
  const result = parseSnapshotPaths("?? src/new-file.ts\n");
  assert.ok(result.has("src/new-file.ts"));
});

test("parseSnapshotPaths: ?? scripts/ path included", () => {
  const result = parseSnapshotPaths("?? scripts/helper.mjs\n");
  assert.ok(result.has("scripts/helper.mjs"));
});

test("parseSnapshotPaths: ?? path outside src/scripts excluded", () => {
  const result = parseSnapshotPaths("?? config/foo.json\n");
  assert.ok(!result.has("config/foo.json"));
});

test("parseSnapshotPaths: ?? docs/ path excluded", () => {
  const result = parseSnapshotPaths("?? docs/something.md\n");
  assert.ok(!result.has("docs/something.md"));
});

test("parseSnapshotPaths: mix of ?? and tracked paths", () => {
  const snapshot = "?? src/a.ts\n M src/b.ts\n?? config/c.json\n";
  const result = parseSnapshotPaths(snapshot);
  assert.ok(result.has("src/a.ts"), "untracked src/ included");
  assert.ok(result.has("src/b.ts"), "tracked modified included");
  assert.ok(!result.has("config/c.json"), "untracked config/ excluded");
});

test("parseSnapshotPaths: empty snapshot returns empty set", () => {
  const result = parseSnapshotPaths("");
  assert.equal(result.size, 0);
});
```

**File**: `tests/engine/run-cycle.touched-json.test.ts` — add one new test after line 153:

The fake claude binary creates `src/new-untracked.ts` using `echo` WITHOUT running `git add`. Git sees it as `??`. After `runCycle`, verify `touched.json` contains `src/new-untracked.ts`.

```typescript
test("runCycle touched.json: untracked ?? src/ file included when not staged by agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-touch-untracked-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-touch-untracked-bin-"));
  try {
    await setupGitRepo(root);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n"),
      "utf8",
    );

    const fakeClaude = join(bin, "claude");
    // Creates src/untracked.ts but does NOT git add — file stays ?? in git status
    await writeFile(
      fakeClaude,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// untracked' > "${root}/src/untracked.ts"\nprintf '## Summary\\nBuild done.\\n\\n## Touched Files\\n- src/untracked.ts\\n'`,
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      issueId: "TOUCH-UT",
      title: "untracked file in touched.json",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await findTouchedJson(root, r.cycleId);
    assert.ok(content.files.includes("src/untracked.ts"), "untracked src/ file must appear in touched.json");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] All six `parseSnapshotPaths` unit tests pass.
- [ ] New integration test passes: `touched.json` contains `src/untracked.ts`.
- [ ] All existing `run-cycle.touched-json.test.ts` tests continue to pass.
- [ ] `run-cycle.ts` coverage floor (≥ 90%) holds.

---

## Task 4: Scope-Warning Tests for `??`-Status Paths in `commitCycle`

### Overview

Add three new tests to `tests/engine/commit-cycle.test.ts` covering `??`-status paths in the scope-warning loop: untracked `src/` file triggers warning, untracked `scripts/` file triggers warning, untracked path outside `src/`/`scripts/` does not.

### Changes Required

**File**: `tests/engine/commit-cycle.test.ts` — append after line 590:

```typescript
test("commitCycle — untracked ?? src/ file not in touched.json: emits commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-src-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    // Write untracked file — no git add, stays as ?? in git status
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/brand-new.ts"), "export const x = 1;\n", "utf8");

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "untracked src scope warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });
    assert.ok(result.status === "ok" || result.status === "skipped");

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("src/brand-new.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — untracked ?? path outside src/scripts: no commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-other-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    // Untracked file outside src/ — should NOT trigger warning
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config/settings.json"), "{}\n", "utf8");

    const log = await createLogger(root, () => {});
    await commitCycle(root, {
      cycleId: "0099",
      title: "untracked non-src no warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });

    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* no log = no warnings */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "untracked path outside src/scripts must not trigger warning");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commitCycle — untracked ?? scripts/ file not in touched.json: emits commit.scope_warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-untracked-scripts-"));
  try {
    await setupRepo(root);
    await mkdir(join(root, "docs/cycle/0099-feature-test"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/0099-feature-test/touched.json"),
      JSON.stringify({ files: [] }) + "\n",
      "utf8",
    );
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/new-tool.mjs"), "#!/usr/bin/env node\n", "utf8");

    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "untracked scripts scope warning",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir: join(root, "docs/cycle/0099-feature-test"),
    });
    assert.ok(result.status === "ok" || result.status === "skipped");

    const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const warn = expectExactlyOne(events, "commit.scope_warning");
    assert.ok(Array.isArray(warn.files) && (warn.files as string[]).includes("scripts/new-tool.mjs"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] Untracked `src/` test: `commit.scope_warning` fires exactly once; `files` includes `src/brand-new.ts`.
- [ ] Untracked outside `src/`/`scripts/` test: no `commit.scope_warning` event.
- [ ] Untracked `scripts/` test: `commit.scope_warning` fires exactly once; `files` includes `scripts/new-tool.mjs`.
- [ ] All five existing scope-warning tests continue to pass.
- [ ] `commit-cycle.ts` coverage floor (≥ 95%) holds.

---

## Task 5: Update `ENGINE.md`

### Overview

Remove the "Known limitation" block about `??` untracked exclusion. Update the footprint description to reflect that `??`-status `src/`/`scripts/` paths are now included.

### Changes Required

**File**: `docs/ENGINE.md`

**Line 155** — Update the exclusion list in the footprint section. Remove `Untracked files (??)` from the exclusion clause:

```markdown
// Before (line 155):
Files dirty before a step begins are excluded (captured in the pre-snapshot). Untracked files (`??`) and denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) are excluded.

// After:
Files dirty before a step begins are excluded (captured in the pre-snapshot). Newly-created untracked files (`??`) under `src/` and `scripts/` are included; untracked paths outside those directories and denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) are excluded.
```

**Line 167** — Remove the entire "Known limitation" paragraph about `??` untracked exclusion (the block starting with `**Known limitation:** Newly-created (untracked) \`src/\` or \`scripts/\` files are absent from \`touched.json\`.` and ending with `...accept the gap and document it as intentional scope.`). The two remaining "Known limitation" blocks (bash-agent exclusion and RESET_ELIGIBLE_STEPS hardcoding) are unaffected.

### Success Criteria

- [ ] `docs/ENGINE.md` footprint section states `??` paths under `src/`/`scripts/` are included.
- [ ] "Known limitation" paragraph for `??` untracked exclusion is gone.
- [ ] Two remaining "Known limitation" blocks (bash-agent, RESET_ELIGIBLE_STEPS) are untouched.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] parseSnapshotPaths called with a ?? src/new-file.ts line returns a set containing src/new-file.ts.` | Task 3 | Unit test: `parseSnapshotPaths: ?? src/ path included` |
| `[ ] parseSnapshotPaths called with a ?? config/foo.json line does not include config/foo.json.` | Task 3 | Unit test: `parseSnapshotPaths: ?? path outside src/scripts excluded` |
| `[ ] accumulateTouchedFiles records a newly-created untracked src/ file in touched.json after a build/fix step that creates it.` | Task 3 | Integration test: untracked file not staged by agent; verified via `findTouchedJson` |
| `[ ] commitCycle emits commit.scope_warning when a ??-status src/ path is not in touched.json.` | Task 4 | Test: `commitCycle — untracked ?? src/ file not in touched.json` |
| `[ ] commitCycle does not emit commit.scope_warning for a ??-status path outside src//scripts/.` | Task 4 | Test: `commitCycle — untracked ?? path outside src/scripts: no commit.scope_warning` |
| `[ ] ENGINE.md footprint section describes that untracked new files under src/ and scripts/ are now included.` | Task 5 | Line 155 update + Known limitation removal |
| `[ ] npm test passes with all existing tests green.` | Tasks 1–4 | Verified after each task; full suite run after Task 4 |
| `[ ] npm run check:coverage passes; per-file floors for run-cycle.ts and commit-cycle.ts do not regress.` | Tasks 3–4 | New tests add coverage; floors are 90% and 95% respectively |
| `[ ] All existing tests still pass.` | Tasks 1–4 | No behavior removed; only `??` paths added to existing paths |
| `[ ] No compiler/linter warnings introduced.` | Tasks 1–2 | `npm run typecheck` after each implementation task |

---

## Testing Strategy

### Unit Tests

- `tests/engine/run-cycle.parse-snapshot.test.ts` (new): six pure-function tests against `parseSnapshotPaths` with static snapshot strings. No git repo, no async, no mocking — direct import of exported function.
- Key edge cases: `??` under `src/`, `??` under `scripts/`, `??` outside both, mix with tracked modified paths, empty string.

### Integration Tests

- `tests/engine/run-cycle.touched-json.test.ts`: new test uses `runCycle` with a fake binary that creates a file without `git add`. Untracked file stays as `??` through the `accumulateTouchedFiles` call. Real git repo via `mkdtemp`. No mocking.
- `tests/engine/commit-cycle.test.ts`: three new tests call `commitCycle` directly against a real git repo with an untracked file (written but not `git add`-ed). `stageFiles` inside `commitCycle` will pick it up; the scope-warning check runs before staging, so `??` status is visible at warning time. No mocking.

### Anti-Mock Notes

All tests use real git repos via `mkdtemp`. No `spawnSync` or `git` mocking. Consistent with existing test patterns in both test files.

## Risk Assessment

- **`appendDocumentationPaths` side-effect**: Extending `parseSnapshotPaths` also affects `appendDocumentationPaths` calls at lines 76 and 84. This makes doc-step delta tracking more accurate for untracked `src/`/`scripts/` files — a benign improvement. No tests cover this path, so no test churn. Accepted.
- **Coverage regression**: New tests add lines to covered paths; existing coverage levels are high (90% and 95%). Risk of regression is low. Verify with `npm run check:coverage` after Task 4.
- **Quote-stripping for `??` paths**: Untracked files with special characters are quoted by git. The defensive `replace(/^"/, "").replace(/"$/, "")` at both change sites handles this correctly. Standard pattern already used throughout.
