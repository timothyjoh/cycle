All three open questions resolved. Writing the plan.

**Design decisions made:**

1. **Clean failure surfacing**: `resetCycleBranchTo` returns `Promise<{ cleanWarning?: string }>` — a non-throwing `gitCleanSoft` helper resolves with the error string on failure. `run-cycle.ts` destructures and emits `step.warning` if set. Keeps guard+reset+clean atomic (single function), warning emission stays in `run-cycle.ts` where `log` lives.

2. **branch.test.ts line 286 assertion**: Flip `stillThere === true` → `stillThere === false`. Test name already says "discards … untracked" so no rename needed — just update the assertion message.

3. **Gitignored-survival test**: New test case seeds `.gitignore` listing `dist/` into the temp repo, then seeds `dist/foo.js`, runs reset, asserts file survives.

```markdown
# Implementation Plan: Cycle 0119

## Overview
Add `git clean -fd` after `git reset --hard` in `resetCycleBranchTo` so aborted build/fix
attempts don't leave untracked debris that silently contaminates the retry. Surface clean
failures as warnings (not throws) via a return-value pattern. Update tests and ENGINE.md.

## Current State (from Research)
- `resetCycleBranchTo` in `src/engine/branch.ts:96-102`: branch guard + `git reset --hard sha`, returns `Promise<void>`. No clean call.
- `git` private helper (line 5-15): throws on non-zero. No non-throwing variant exists yet.
- Call site in `run-cycle.ts:193`: `await resetCycleBranchTo(repoRoot, prior)` — warning emission for similar failures happens here (lines 187-190), `log` is in scope.
- Existing unit test at `branch.test.ts:285-286` **asserts untracked files survive** — this assertion must flip.
- Both integration tests (build at line 1085, fix at line 1322) seed `untracked.txt` but don't assert it's removed — need additive assertions.
- `.gitignore` lists `dist/`, `node_modules/`, `.cycle/` — `-fd` respects these; `-fdx` would wipe them.

## Desired End State
- `resetCycleBranchTo` runs `git clean -fd` after every successful `git reset --hard` on a cycle branch.
- Clean failures produce `step.warning` with `reason: "clean_failed"` (observable, non-throwing).
- Branch guard still throws before reset or clean; untracked files are untouched when guard fires.
- Gitignored paths (e.g. `dist/foo.js`) survive the clean.
- All existing tests pass; three new test assertions confirm new behavior; one assertion flipped; one new test case added.
- ENGINE.md restart-policy section documents `git clean -fd` addition and `-fd` vs `-fdx` rationale.

## What We're NOT Doing
- Not using `-fdx` (would wipe `dist/`, `node_modules/`, `.cycle/` — engine working state)
- Not broadening restart policy beyond `build` and `fix` steps
- Not changing step prompts, workflow YAML, or warning taxonomy for existing `_pre_sha_missing` / `_pre_sha_unreachable` reasons
- Not touching `no_branch: true` workflows (already skip the entire capture/reset/clean path)
- Not adding a separate exported `cleanCycleBranch` — atomicity requires one function

## Implementation Approach
Add a `gitCleanSoft` private helper (resolves `string | null` — error message or null on success,
never rejects) parallel to the existing `revParse`/`branchExists` non-throwing helpers. Change
`resetCycleBranchTo` return type from `Promise<void>` to `Promise<{ cleanWarning?: string }>`.
The single call site in `run-cycle.ts` destructures the result and emits `step.warning` on non-null.
Test changes are additive (flip one assertion, add assertions in two integration tests, one new
unit test case).

---

## Task 1: Add `gitCleanSoft` helper and update `resetCycleBranchTo`

### Overview
Add the non-throwing clean helper and wire it into `resetCycleBranchTo`. Change the return type
to carry optional warning text. Add the required inline rationale comment.

### Changes Required
**File**: `src/engine/branch.ts`

After the `git` helper (line 15), add:
```typescript
function gitCleanSoft(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["clean", "-fd"], { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => resolve(code === 0 ? null : `git clean -fd failed: ${stderr.trim()}`));
    child.on("error", e => resolve(`git clean -fd failed: ${e.message}`));
  });
}
```

Replace `resetCycleBranchTo` (lines 96-102):
```typescript
export async function resetCycleBranchTo(repoRoot: string, sha: string): Promise<{ cleanWarning?: string }> {
  const branch = await currentBranchName(repoRoot);
  if (!branch || !branch.startsWith("cycle/")) {
    throw new Error(`resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=${branch ?? "unknown"})`);
  }
  await git(repoRoot, ["reset", "--hard", sha]);
  // -fd not -fdx: gitignored paths (dist/, node_modules/, .cycle/) are engine working state
  // and must survive mid-run. -fdx would wipe them and corrupt the in-progress cycle.
  const cleanErr = await gitCleanSoft(repoRoot);
  return cleanErr != null ? { cleanWarning: cleanErr } : {};
}
```

### Success Criteria
- [ ] TypeScript compiles cleanly (`npm run typecheck`)
- [ ] `resetCycleBranchTo` signature changed; function returns `{ cleanWarning?: string }`
- [ ] `gitCleanSoft` helper follows `shell: false`, array-args subprocess discipline
- [ ] Inline `-fd` vs `-fdx` comment present

---

## Task 2: Update `run-cycle.ts` call site to handle clean warning

### Overview
Destructure the new return value and emit `step.warning` when the clean fails. The warning
shape matches the existing `_pre_sha_missing` pattern.

### Changes Required
**File**: `src/engine/run-cycle.ts` (line 193)

Replace:
```typescript
await resetCycleBranchTo(repoRoot, prior);
headSha = prior;
```
With:
```typescript
const { cleanWarning } = await resetCycleBranchTo(repoRoot, prior);
if (cleanWarning) {
  await log.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: "clean_failed", detail: cleanWarning });
}
headSha = prior;
```

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] `npm test` passes (all existing tests still green)
- [ ] `step.warning` is emitted (not thrown, not swallowed) on clean failure

---

## Task 3: Update unit tests in `branch.test.ts`

### Overview
Three changes: (1) flip the existing "untracked survives" assertion, (2) extend the branch-guard
test to seed an untracked file and assert it's still present after guard throws, (3) add a new
gitignored-survival test.

### Changes Required
**File**: `tests/engine/branch.test.ts`

**Change 1 — flip assertion** (line 285-286):
```typescript
// before:
const stillThere = await stat(join(root, "untracked.txt")).then(() => true, () => false);
assert.equal(stillThere, true, "git reset --hard does not remove untracked files");
// after:
const stillThere = await stat(join(root, "untracked.txt")).then(() => true, () => false);
assert.equal(stillThere, false, "git clean -fd removes untracked files after reset");
```

**Change 2 — branch guard test** (lines 292-309): seed untracked file before `assert.rejects`, assert it's still there after:
```typescript
// add after git(root, ["commit", "--allow-empty", "-m", "init"]):
await writeFile(join(root, "untracked-sentinel.txt"), "guard-sentinel", "utf8");

// add after the assert.rejects block:
const sentinelStillThere = await stat(join(root, "untracked-sentinel.txt")).then(() => true, () => false);
assert.equal(sentinelStillThere, true, "branch guard throws before clean; untracked file untouched");
```

**Change 3 — new test** (add after line 328):
```typescript
test("resetCycleBranchTo: gitignored file survives -fd clean", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, ".gitignore"), "dist/\n", "utf8");
    git(root, ["add", ".gitignore"]);
    git(root, ["commit", "-m", "init"]);

    await createCycleBranch(root, { cycleId: "0119", workflow: "feature", slug: "clean-test" });
    const sha = git(root, ["rev-parse", "HEAD"]).trim();

    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "dist", "foo.js"), "engine artifact", "utf8");

    await resetCycleBranchTo(root, sha);

    const survived = await stat(join(root, "dist", "foo.js")).then(() => true, () => false);
    assert.equal(survived, true, "gitignored dist/foo.js survives -fd (not -fdx)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] All four `resetCycleBranchTo` unit tests pass
- [ ] New gitignored-survival test passes
- [ ] Branch guard test now also verifies untracked file is untouched

---

## Task 4: Add untracked-removal assertions to integration tests

### Overview
Both "resume at build" and "resume at fix" (Test C) already seed `untracked.txt`. Add an
additive assertion in each that the file is gone after the reset. The `doesNotMatch(log,
/"event":"step\.warning"/)` assertion already present should still pass since `git clean`
succeeds in normal test repos.

### Changes Required
**File**: `tests/engine/run-cycle.test.ts`

**"resume at build"** — after line 1110 (`assert.equal(partialGone, true)`), add:
```typescript
const untrackedGone = await stat(join(root, "untracked.txt")).then(() => false, () => true);
assert.equal(untrackedGone, true, "untracked file removed by git clean -fd after build reset");
```

**"resume at fix" (Test C)** — after line 1347 (`assert.equal(partialGone, true)`), add:
```typescript
const untrackedGone = await stat(join(root, "untracked.txt")).then(() => false, () => true);
assert.equal(untrackedGone, true, "untracked file removed by git clean -fd after fix reset");
```

### Success Criteria
- [ ] Both integration tests pass with new assertions
- [ ] `doesNotMatch(log, /"event":"step\.warning"/)` assertions at lines 1120 and 1357 still pass
- [ ] `npm test` green

---

## Task 5: Update `docs/ENGINE.md` restart policy section

### Overview
Add a paragraph noting that `resetCycleBranchTo` now also runs `git clean -fd` after the hard
reset, with rationale for `-fd` vs `-fdx`.

### Changes Required
**File**: `docs/ENGINE.md`

Find the restart policy section (covers `RESET_ELIGIBLE_STEPS`, `resetCycleBranchTo`, hard-reset
behavior). After the description of `git reset --hard`, add:

> After the hard reset, `resetCycleBranchTo` also runs `git clean -fd` to remove untracked
> files left by the aborted attempt. This ensures the working tree is byte-equivalent to a fresh
> checkout at the captured SHA. `-fd` is used deliberately — **not** `-fdx` — so that gitignored
> paths (`dist/`, `node_modules/`, `.cycle/`) which represent engine working state are preserved
> across the restart. A non-zero exit from `git clean` surfaces as a `step.warning` with
> `reason: "clean_failed"` and does not abort the retry.

### Success Criteria
- [ ] ENGINE.md updated with restart-policy clean description
- [ ] `-fd` vs `-fdx` rationale documented in ENGINE.md
- [ ] `clean_failed` warning reason documented

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] resetCycleBranchTo calls git clean -fd after git reset --hard when on a cycle/ branch` | Task 1 | `gitCleanSoft` wired after reset |
| `[ ] Non-zero exit from git clean produces an observable warning (does not throw, does not silently continue)` | Task 1 + Task 2 | Return value carries warning; run-cycle.ts emits step.warning |
| `[ ] When HEAD is not on a cycle/ branch, function throws before reset or clean; untracked files are untouched` | Task 3 (Change 2) | Branch guard test gains untracked-sentinel assertion |
| `[ ] A gitignored file (e.g. dist/foo.js) survives the clean, confirming -fd semantics` | Task 3 (Change 3) | New gitignored-survival unit test |
| `[ ] Existing Test C (resume at fix hard-resets…) still passes with the new clean call added` | Task 4 | Additive assertion only; existing assertions unchanged |
| `[ ] All existing tests still pass` | Tasks 1–4 | No existing tests removed; one assertion flipped to match new behavior |
| `[ ] No compiler/linter warnings introduced` | Task 1 + Task 2 | Return type change propagated to sole call site |

---

## Testing Strategy

### Unit Tests
- `tests/engine/branch.test.ts`: four unit tests cover `resetCycleBranchTo` directly
  - Flipped assertion: untracked removed (not survived) after reset
  - Branch guard: untracked file untouched when guard throws (new assertion in existing test)
  - Gitignored survival: `dist/foo.js` with `.gitignore` listing `dist/` survives `-fd` (new test)
  - Null/error cases (lines 311, 323): unchanged — guard fires before any git op

### Integration / E2E Tests
- `tests/engine/run-cycle.test.ts` (resume-at-build, resume-at-fix):
  - Both already seed `untracked.txt`; additive assertions verify it's removed post-reset
  - Both retain `doesNotMatch(log, /"event":"step\.warning"/)` — clean succeeds in temp repos
  - No mocking: real temp git repos, real `git clean` invocation

## Risk Assessment
- **Return type change breaks callers**: Only one call site (`run-cycle.ts:193`); TypeScript catches any missed sites at compile time. Risk: none.
- **`git clean -fd` removes test fixture files**: Only untracked, non-gitignored files are removed. Tests that need temp files present after reset must gitignore them (gitignored-survival test models this explicitly). Risk: low — existing integration tests don't rely on untracked files surviving.
- **`gitCleanSoft` error path never triggered in tests**: `git clean` succeeds in well-formed temp repos; the warning path is tested only by unit test (inject failure) or manual testing. Risk: acceptable — the code path is simple and the `step.warning` emission pattern is already battle-tested.
```
