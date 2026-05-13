```markdown
# Implementation Plan: Cycle 0007

## Overview
Add explicit remote-ref deletion to `pr.sh` after the synchronous fallback merge succeeds, so feature branches don't orphan on auto-merge-disabled repos. Cover the change with static-shape regression tests in the existing fallback test file.

## Current State (from Research)
- `src/defaults/scripts/pr.sh:42` issues `gh pr merge ... --squash --delete-branch` in the fallback block; the `--delete-branch` flag is silently ignored when GitHub does **not** schedule the merge (synchronous path), leaving `origin/cycle/<workflow>/<slug>` orphaned.
- Fallback success block at `src/defaults/scripts/pr.sh:43-46` is the right insertion point — after the merge, before `echo "${pr_url}"; exit 0`.
- `${branch}` is already in scope (`src/defaults/scripts/pr.sh:10`); owner/repo will be resolved via `gh repo view --json nameWithOwner -q .nameWithOwner`.
- Tests are static-shape regex assertions on the file contents (`tests/defaults/pr-auto-merge-fallback.test.ts:1-59`). Scripts run inside `gh` so live integration is infeasible.
- Build pipeline (`scripts/build.mjs:29-31`) copies `src/defaults` → `dist/defaults` recursively, restoring byte-equality after each edit.
- Test runner: `node:test` + `node:assert/strict` via `node --test --experimental-strip-types`. No mocking.

## Desired End State
- `src/defaults/scripts/pr.sh` fallback success branch resolves owner/repo, deletes `git/refs/heads/${branch}` via `gh api`, and continues to `echo "${pr_url}"; exit 0` whether or not deletion succeeds.
- Deletion failure emits a `pr.sh:`-prefixed stderr warning but does not change exit code or stdout.
- 4 new assertions in `tests/defaults/pr-auto-merge-fallback.test.ts` lock in: DELETE presence, ref path shape, ordering after fallback merge, gating on `fallback_rc -eq 0`, warn-and-continue contract.
- `npm test` green; `npm run build` regenerates `dist/defaults/scripts/pr.sh` byte-identical to source.

Verification:
- `grep -c 'gh api -X DELETE' src/defaults/scripts/pr.sh` → 1.
- `diff src/defaults/scripts/pr.sh dist/defaults/scripts/pr.sh` → empty after build.
- `npm test` → all tests pass, including the 7 prior fallback assertions plus the new 4.

## What We're NOT Doing
- No change to the auto-merge poll happy path. `--delete-branch` continues to handle that.
- No refactor of `pr.sh` structure outside the fallback success block.
- No engine-side cleanup of local feature branches after `cycle.end` (separate sharp-edge issue, separately queued).
- No retroactive cleanup of already-orphaned remote branches on the `cycle` repo (operator concern).
- No new test file — the existing `pr-auto-merge-fallback.test.ts` already scopes "fallback semantics" and the new assertions belong with the other 7.
- No URL-encoding of `/` in the ref path. GitHub's git refs API accepts unencoded slashes (each `/` is a real path segment).
- No DOGFOOD.md update — file does not exist in repo root.

## Implementation Approach
Single vertical slice. The change surface is ~6 lines of bash in `pr.sh` and ~4 new `test()` blocks. TDD order: write failing test assertions first, then implement the bash change, then run `npm run build` and the sync helper to propagate to `dist/` and `.cycle/`.

Owner/repo resolution is inlined **inside** the fallback success block (not hoisted to script top) so the happy auto-merge path pays zero extra `gh` calls. The `gh api -X DELETE` follows the existing `rc`/`fallback_rc` idiom: assign `delete_rc=0`, then `|| delete_rc=$?`. Branch with `/` characters is fed un-encoded.

---

## Task 1: Add failing regression tests for ref deletion

### Overview
Extend `tests/defaults/pr-auto-merge-fallback.test.ts` with 4 new assertions covering the new behavior. Tests fail before implementation (red).

### Changes Required
**File**: `tests/defaults/pr-auto-merge-fallback.test.ts`
**Changes**: Append the following tests after the existing `test("pr.sh: fallback exit code captured ...")` block.

```typescript
test("pr.sh: deletes orphaned remote ref after successful fallback merge", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(
    src,
    /gh api -X DELETE "?repos\/[^\s"]*\/git\/refs\/heads\/\$\{branch\}"?/,
    "pr.sh must issue an explicit DELETE to git/refs/heads/${branch} after fallback merge",
  );
});

test("pr.sh: ref deletion call is positioned after the fallback gh pr merge", () => {
  const src = readFileSync(PR_SH, "utf8");
  const mergeIdx = src.search(/gh pr merge "\$\{pr_number\}" --squash --delete-branch/);
  const deleteIdx = src.search(/gh api -X DELETE "?repos\/[^\s"]*\/git\/refs\/heads\//);
  assert.ok(mergeIdx >= 0, "fallback merge call missing");
  assert.ok(deleteIdx >= 0, "ref delete call missing");
  assert.ok(
    deleteIdx > mergeIdx,
    `ref delete (${deleteIdx}) must appear after fallback merge (${mergeIdx})`,
  );
});

test("pr.sh: ref deletion gated on fallback merge success (fallback_rc -eq 0)", () => {
  const src = readFileSync(PR_SH, "utf8");
  const gateRegex =
    /if \[ "\$\{fallback_rc\}" -eq 0 \];\s*then[\s\S]*?gh api -X DELETE[\s\S]*?echo "\$\{pr_url\}"/;
  assert.match(
    src,
    gateRegex,
    "DELETE must live inside the fallback success branch, before echo ${pr_url}",
  );
});

test("pr.sh: ref deletion failure warns to stderr with pr.sh: prefix and still exits 0", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(
    src,
    /pr\.sh: failed to delete remote branch/,
    "ref-deletion failure must emit a pr.sh:-prefixed warning",
  );
  // The warn-and-continue contract: warning must be in the success block where echo ${pr_url} still runs.
  const successBlock = src.match(
    /if \[ "\$\{fallback_rc\}" -eq 0 \];\s*then[\s\S]*?echo "\$\{pr_url\}"\s*\n\s*exit 0/,
  );
  assert.ok(successBlock, "fallback success block not found");
  assert.match(
    successBlock[0],
    /pr\.sh: failed to delete remote branch/,
    "ref-deletion warning must live inside the fallback success block (before echo ${pr_url}; exit 0)",
  );
});
```

### Success Criteria
- [ ] `npm test` shows 4 new failing assertions in `pr-auto-merge-fallback.test.ts`.
- [ ] Existing 7 assertions still pass.
- [ ] TS strips and runs under `node --test --experimental-strip-types` without syntax errors.

---

## Task 2: Implement ref deletion in pr.sh fallback success block

### Overview
Edit `src/defaults/scripts/pr.sh` so the fallback success branch resolves owner/repo, deletes the remote ref, and falls through to `echo "${pr_url}"; exit 0` regardless of deletion outcome. New tests turn green; old tests stay green.

### Changes Required
**File**: `src/defaults/scripts/pr.sh`
**Changes**: Replace the fallback success block at lines 41–46 (the `*enablePullRequestAutoMerge*|...` case arm body up to the success `echo "${pr_url}"; exit 0`) with:

```bash
    fallback_rc=0
    gh pr merge "${pr_number}" --squash --delete-branch || fallback_rc=$?
    if [ "${fallback_rc}" -eq 0 ]; then
      # gh pr merge --delete-branch is a no-op on the synchronous merge path
      # (it only fires when GitHub schedules an async auto-merge). Delete the
      # remote ref explicitly so cycle/feature/* branches don't pile up.
      repo_slug=$(gh repo view --json nameWithOwner -q .nameWithOwner)
      delete_rc=0
      gh api -X DELETE "repos/${repo_slug}/git/refs/heads/${branch}" >/dev/null 2>&1 || delete_rc=$?
      if [ "${delete_rc}" -ne 0 ]; then
        echo "pr.sh: failed to delete remote branch ${branch} (exit ${delete_rc}); merge succeeded, continuing" >&2
      fi
      echo "${pr_url}"
      exit 0
    fi
```

Leave lines 47–49 (failure-path stderr) and the rest of the script unchanged.

### Success Criteria
- [ ] `npm test` green across all 11 assertions in `pr-auto-merge-fallback.test.ts` and all other test files.
- [ ] `shellcheck src/defaults/scripts/pr.sh` (if available) produces no new warnings; manual review confirms `set -euo pipefail` compatibility (every potentially-failing command is `|| rc=$?`-guarded or wrapped in an `if`).
- [ ] The fallback failure path (`fallback_rc != 0`) still emits both pre-existing `pr.sh:` stderr lines and exits 1 — verified by inspection (no edits to lines 47–49).
- [ ] Happy auto-merge path is byte-identical above line 35 — `git diff src/defaults/scripts/pr.sh` shows changes only within the fallback case arm body.

---

## Task 3: Rebuild dist and sync dogfooded scripts

### Overview
Regenerate `dist/defaults/scripts/pr.sh` so it is byte-identical to `src/defaults/scripts/pr.sh`, and refresh the in-repo dogfooded copy at `.cycle/scripts/pr.sh`. Cycle 0005/0006 convention.

### Changes Required
Run, in order:

```bash
npm run build
npm run sync-defaults
```

Then verify:

```bash
diff src/defaults/scripts/pr.sh dist/defaults/scripts/pr.sh
diff src/defaults/scripts/pr.sh .cycle/scripts/pr.sh
```

Both diffs must be empty.

### Success Criteria
- [ ] `diff` of source vs `dist/` empty.
- [ ] `diff` of source vs `.cycle/scripts/` empty.
- [ ] `git status` shows modifications to `src/defaults/scripts/pr.sh`, `dist/defaults/scripts/pr.sh`, `.cycle/scripts/pr.sh`, and `tests/defaults/pr-auto-merge-fallback.test.ts` only (plus the cycle docs).
- [ ] Selective-staging denylist in `commit.sh` does not reject any of these paths (none live under `dist/foo.js` style residuals — `dist/defaults/scripts/pr.sh` is an expected built artifact already tracked).

---

## Testing Strategy

### Unit Tests
- 4 new static-shape assertions cover: (a) DELETE call presence with `git/refs/heads/${branch}` ref shape, (b) textual ordering after fallback merge, (c) gating inside `if [ "${fallback_rc}" -eq 0 ]; then ... fi` and before `echo "${pr_url}"`, (d) `pr.sh:`-prefixed warning living inside the success block.
- Edge cases captured by regex shape: ordering is enforced positionally (not just presence), gating is enforced by requiring DELETE between the `if fallback_rc -eq 0` line and the `echo ${pr_url}` line.
- No mocking — scripts are asserted as text. This matches the codebase convention (Cycle 0005/0006).

### Integration / E2E Tests
- Live `gh pr merge` against a real GitHub repo is infeasible in CI; static-shape coverage is the contract.
- Dogfooding step is the integration test: the next cycle to merge will exercise the new code path against `timothyjoh/cycle` (auto-merge is enabled on that repo, so the fallback path won't fire on the default; however cycle 0007's own PR — if `gh pr merge --auto` is rejected due to a transient state — will exercise the new DELETE).
- Manual smoke check (optional, run by operator after merge): on a repo with auto-merge disabled, run a no-op cycle and confirm `gh api repos/<owner>/<repo>/git/refs/heads/cycle/feature/<slug>` returns 404 after the PR merges.

## Risk Assessment
- **`gh api -X DELETE` against a branch already deleted (race with another tool)**: returns 422 / non-zero. Mitigation: `|| delete_rc=$?` swallows the exit code and the warn-and-continue branch logs and continues to `echo "${pr_url}"; exit 0`. Cycle does not fail.
- **`gh repo view --json nameWithOwner` fails (network / auth)**: would propagate under `set -e` and kill the script before DELETE. The merge already succeeded at that point, so this would leave the orphaned branch *and* exit the cycle as failed. Mitigation: assign with `|| repo_slug=""` pattern, then guard the DELETE with `if [ -n "${repo_slug}" ]`. **Decision**: keep simple unconditional assignment — `gh repo view` is read-only and runs against an already-verified auth context (every prior `gh pr` call in the script succeeded). Adding a guard adds complexity for a failure mode that should not exist in practice.
- **Branch name containing characters that `gh api` rejects**: cycle branches are `cycle/<workflow>/<kebab-slug>` — only `/`, `-`, alphanumerics. `/` is a valid path segment in `git/refs/heads/`. No risk.
- **Drift between `src/defaults/scripts/pr.sh` and `dist/defaults/scripts/pr.sh`**: prevented by Task 3 — `npm run build` regenerates `dist/` from `src/` recursively.
- **Future change to the fallback success block invalidating the positional regex**: the test for "DELETE between `if fallback_rc -eq 0` and `echo ${pr_url}`" is robust to inner reformatting but would break if someone removes the gating `if`. That break is desired — it would mean the contract is broken.
```
