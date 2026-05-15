Plan ready. Output to stdout.

```markdown
# Implementation Plan: Cycle 0068

## Overview
Add a single new test file `tests/defaults/commit_sh.test.ts` driving `src/defaults/scripts/commit.sh` against ephemeral repos via `spawnSync`, locking in the worktree-missing-path guard at `commit.sh:54-65` with three behavioral cases (staged deletion, unstaged deletion, control).

## Current State (from Research)
- Guard under test lives at `src/defaults/scripts/commit.sh:54-65` (two case-arms `D*` ⇒ skip, `*D` ⇒ `git add -u`; fallthrough `git add -- "$path"` at line 65 is what would surface `pathspec did not match` on regression).
- Canonical helper block at `tests/defaults/commit-staging.test.ts:8-54` defines exactly the four helpers SPEC names (`run`, `makeRepo`, `runScript`, `commitFiles`, plus `porcelainPaths`). Pattern: array-args `spawnSync`, `mkdtemp` + `try/finally` cleanup, env-spread with `CYCLE_ID`/`CYCLE_TITLE`.
- No existing test exercises tracked-file deletion before invoking the script (verified across all five `test(...)` blocks in `commit-staging.test.ts`).
- `commitFiles` at line 47 uses `--name-only`; the new file needs `--name-status` to distinguish `D` from `A`/`M` (SPEC line 41).
- No `gh` / no remote in ephemeral repo ⇒ `closes_block` returns empty ⇒ script takes single-`-m` commit branch at line 88; no fixture work needed for closes-linkage.
- `CYCLE_ISSUE_ID` is intentionally unset across all three new cases — keeps them focused on the deletion guard. `closes-linkage.test.ts` already covers that other branch.

## Desired End State
- `tests/defaults/commit_sh.test.ts` exists, contains three `test(...)` blocks, runs under `npm test` with the spec reporter, all pass.
- Verified by: `npm test` shows three new passing tests under `tests/defaults/commit_sh.test.ts`; total count grows from 398 → 401; `npm run typecheck` clean; `npm run test:coverage` line ≥95 / branch ≥75 / func ≥90; per-file `src/engine/triage.ts ≥95%` untouched.
- Manual revert verification (documented in BUILD.md): temporarily replace `commit.sh:59-64` with no guard (or comment out the `D*`/`*D` case-arms), re-run only the new test file via `node --test --experimental-strip-types tests/defaults/commit_sh.test.ts`, confirm Cases 1 and 2 fail with `pathspec … did not match` in stderr.

## What We're NOT Doing
- Not editing or merging into `tests/defaults/commit-staging.test.ts` (SPEC line 14, separate file per acceptance text).
- Not modifying `src/defaults/scripts/commit.sh` or `src/defaults/scripts/lib/closes.sh`.
- Not adding `commit-trunk.sh` regression tests (SPEC line 17 out-of-scope).
- Not exercising the `closes_block` path (separate `closes-linkage.test.ts` owns it).
- Not asserting raw `git status --porcelain` XY before invocation — relying on commit content + stderr is sufficient per SPEC line 29.
- Not refactoring any helper into a shared module — in-file local helpers only (SPEC forbids sibling-file edits).

## Implementation Approach
Single new file, single task. Helpers cloned verbatim from `commit-staging.test.ts:8-54` and pasted into the new file (intentional duplication — SPEC line 14 forbids cross-file refactor; consolidation deferred). One adaptation: a local `commitFilesWithStatus` helper using `git diff-tree --no-commit-id --name-status -r HEAD` returning `Array<[status, path]>` so Case 1 / Case 2 can assert `D victim.txt` specifically.

Stderr negative match uses the loose regex `/pathspec .* did not match/` (research open-question resolution — safer across git versions than anchoring on quote style).

Stub `.cycle/log.jsonl` row in `makeRepo` retained for parity with sibling tests (research open question — default: retain; YAGNI deferred).

BUILD.md records textual confirmation only ("manually reverted lines 59-64, Case 1 + Case 2 fail with `pathspec … did not match`") — no copy-paste of failing output (research open-question resolution; issue text requires only the assertion that it fails).

---

## Task 1: Add `tests/defaults/commit_sh.test.ts` with three deletion/control cases

### Overview
Create the new test file. One file, ~150 LOC. Three top-level `test(...)` blocks. Local helper block adapted from `commit-staging.test.ts:8-54`.

### Changes Required

**File**: `tests/defaults/commit_sh.test.ts` (new)

**Imports** (same order as sibling, ES2023 floor, Node native test runner):
```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
```

**Helpers** (in-file, paste-then-adapt from `commit-staging.test.ts:8-54`):
- `run(cwd, cmd, args)` — verbatim from sibling. Throws on non-zero status.
- `makeRepo(): Promise<string>` — verbatim from sibling: `mkdtemp("cycle-commit-sh-")` prefix change only; same `.gitignore` + `README.md` seed; same `.cycle/scripts/{commit.sh,lib/closes.sh}` copy + chmod 0o755; same stub `.cycle/log.jsonl`.
- `runScript(cwd, env)` — verbatim from sibling.
- `commitFilesWithStatus(cwd): Array<[string, string]>` — new variant using `git diff-tree --no-commit-id --name-status -r HEAD`, splits each line on `\t` (or `/\s+/`) into `[status, path]`, filters empty, sorted by path. Returns tuples not strings.

**Case 1 — staged deletion** (`D ` porcelain):
```ts
test("commit.sh stages and commits a staged deletion (D in column 1)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "victim.txt"), "doomed\n");
    run(root, "git", ["add", "victim.txt"]);
    run(root, "git", ["commit", "-q", "-m", "add victim"]);
    run(root, "git", ["rm", "-q", "victim.txt"]); // stages the deletion ⇒ "D " porcelain

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "staged deletion" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    assert.ok(
      files.some(([s, p]) => s === "D" && p === "victim.txt"),
      `expected D victim.txt in commit, got: ${JSON.stringify(files)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Case 2 — unstaged worktree deletion** (` D` porcelain):
```ts
test("commit.sh stages and commits an unstaged worktree deletion (D in column 2)", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "victim.txt"), "doomed\n");
    run(root, "git", ["add", "victim.txt"]);
    run(root, "git", ["commit", "-q", "-m", "add victim"]);
    await rm(join(root, "victim.txt"));  // unstaged worktree deletion ⇒ " D" porcelain

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "unstaged deletion" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    assert.ok(
      files.some(([s, p]) => s === "D" && p === "victim.txt"),
      `expected D victim.txt in commit, got: ${JSON.stringify(files)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Case 3 — control: new file + modification**:
```ts
test("commit.sh control: stages a new file under src/ and a modified README", async () => {
  const root = await makeRepo();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");
    await writeFile(join(root, "README.md"), "seed\nupdated line\n");

    const r = runScript(root, { CYCLE_ID: "0099", CYCLE_TITLE: "control" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /pathspec .* did not match/);

    const files = commitFilesWithStatus(root);
    const map = new Map(files);
    assert.equal(map.get("src/app.ts"), "A", `expected A for src/app.ts: ${JSON.stringify(files)}`);
    assert.equal(map.get("README.md"), "M", `expected M for README.md: ${JSON.stringify(files)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] `npm test` picks up `tests/defaults/commit_sh.test.ts`; spec reporter shows three new passing tests.
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` line ≥95, branch ≥75, func ≥90; per-file `src/engine/triage.ts ≥95%` floor untouched.
- [ ] Total test count 398 → 401, all green.
- [ ] Subprocess discipline honored: every `spawnSync` uses array args; no `shell: true`; no `exec`/`execSync`.
- [ ] Each test wraps body in `try { … } finally { await rm(root, { recursive: true, force: true }); }`.
- [ ] Manual revert verification (recorded in BUILD.md by build step): commenting out `commit.sh:60-62` case-arms causes Case 1 + Case 2 to fail with `pathspec … did not match` in stderr; control case still passes.

---

## Testing Strategy

### Unit Tests
- Three behavioral cases covering the two guard arms (`D*` skip, `*D` ⇒ `git add -u`) plus a control to prove the test harness itself works.
- Stderr negative-match (`/pathspec .* did not match/`) is the precise regression signal — git emits that exact wording when `git add -- <missing-path>` fails.
- Commit-content positive assertion via `git diff-tree --name-status -r HEAD` distinguishes `D` from `A`/`M`, which `--name-only` could not.
- **Mocking**: none. Real `git` subprocesses against real ephemeral repos via `spawnSync` — matches the existing `tests/defaults/` discipline.

### Integration / E2E Tests
- The three cases ARE the integration tests: full `commit.sh` invocation via `bash`, real `git status --porcelain` parsed by the script, real commit object produced, real diff-tree inspected. No layer skipped.

## Risk Assessment
- **Flaky `git` config / signing on contributor machines**: `makeRepo` sets `user.email`/`user.name`/`commit.gpgsign=false` per-repo (matches sibling) — no global config touched.
- **Temp-dir leak on assert failure**: every test wraps in `try/finally rm(recursive, force)` — leak-proof.
- **`git diff-tree --name-status` tab-vs-space delimiter**: it's a tab between status and path; split on `/\s+/` handles either, returning `[status, path]` tuples safely.
- **`git rm` exit codes / cross-platform behavior**: standard porcelain, identical across macOS/Linux runners in this repo's CI matrix; no Windows support in scope.
- **Coverage regression**: zero `src/` changes ⇒ deltas non-negative for line/branch/func; per-file `triage.ts` floor unaffected.
- **Future helper-consolidation churn**: in-file duplicated helpers are intentional (SPEC forbids sibling edit); flagged in PLAN as deferred to a future refactor cycle. No code comment needed in-source.
```

End-of-turn: plan written. One file, three cases, helpers cloned from sibling, `commitFilesWithStatus` adapted for `D`/`A`/`M` discrimination. Open questions all resolved (loose pathspec regex, retain stub log row, BUILD.md textual confirmation only).
