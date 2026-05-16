I have enough context to resolve all open questions and write the plan. Let me work through the decisions:

1. **`CYCLE_BASE` source**: `commitCycle()` uses `cfg.engine.base_branch` — it's TypeScript with parsed config, not a subprocess reading env vars.
2. **Staging logic**: Inline as private `stageFiles()` in `commit-cycle.ts` — single caller, no separate module.
3. **Deleted test files**: Delete all 5. New TypeScript unit tests replace coverage for ported logic.
4. **`no_branch` replacement**: `cfg.engine.commit.mode` drives the branch-creation gate in `run-cycle.ts`. `trunk`/`local-only` → `prepareTrunkArtifactDir`; future `worktree-pr` → `createCycleBranch` (not implemented this cycle).
5. **`document` workflow**: `.cycle/`-local. Remove its `commit` step + `no_branch` flag; engine commit handles it.
6. **PR script fate**: Delete `pr.sh` and its two test files. Auto-merge/restart-tolerance belongs to `worktree-pr` mode (deferred).

```markdown
# Implementation Plan: Cycle 0112

## Overview

Extract commit, push, and PR-creation from workflow step definitions and make
them engine-managed behavior. Delivers `trunk` and `local-only` modes end-to-end:
config parsing, a new `commitCycle()` function with push retry, closes-block
generation, full workflow migration, script deletion, and test coverage.

## Current State (from Research)

- Every workflow embeds explicit `commit`/`pr` bash steps; engine has no
  awareness of commit lifecycle, retries, or push failures.
- `src/engine/workflow.ts` defines `Workflow.no_branch?: boolean` which
  controls branch-vs-trunk path in `run-cycle.ts` (4 callsites).
- `src/engine/run-cycle.ts` has no commit logic; `commitCycle()` does not exist.
- Two `runCycle` call sites in `cli.ts` (lines 311 and 405): both need
  `commitCycle()` inserted between the successful return and `drainSuccess()`.
- Staging logic lives in `src/defaults/scripts/commit.sh` (~40 lines bash).
- Closes-block logic lives in `src/defaults/scripts/lib/closes.sh`.
- Five test files in `tests/defaults/` test the bash scripts being deleted.
- Branch pattern: all git ops in `branch.ts` use `spawn` with array args;
  `buildChildEnv()` must wrap all subprocess environments.

## Desired End State

After this cycle:
- `src/engine/commit-cycle.ts` exists with `CommitConfig`, `stageFiles()`,
  `buildClosesBlock()`, and `commitCycle()`.
- `src/engine/workflow.ts`: `CommitConfig` type added, `EngineConfig.commit`
  field present, `Workflow.no_branch` field removed.
- `src/engine/run-cycle.ts`: `no_branch` guards replaced with
  `cfg.engine.commit.mode`-based dispatch.
- `src/cli.ts`: `commitCycle()` called at both successful `runCycle` return
  sites; commit failure treated as cycle failure (retry/terminal path).
- `src/defaults/workflows.yml` + `.cycle/workflows.yml`: `commit`/`pr` steps
  removed from all workflows; `engine.commit` block present with `mode: trunk`.
- `src/defaults/scripts/commit.sh`, `commit-trunk.sh`, `pr.sh`,
  `lib/closes.sh` deleted.
- `tests/defaults/commit_sh.test.ts`, `commit-staging.test.ts`,
  `closes-linkage.test.ts`, `pr-auto-merge-fallback.test.ts`,
  `pr-restart-tolerance.test.ts` deleted.
- `tests/engine/commit-cycle.test.ts` exists with full coverage.
- `tests/defaults/feature-yaml.test.ts` and `quickfix-yaml.test.ts` updated.
- `docs/ENGINE.md` has new section on engine-managed commit lifecycle.
- `npm test` passes; coverage does not decrease; `npm run typecheck` clean.

Verification: `npm test` green, `npm run typecheck` clean,
`npm run test:coverage` + `npm run check:coverage` pass.

## What We're NOT Doing

- `worktree-pr` mode (branch create/destroy, trunk sync after merge)
- `review-pr` mode (halt-after-PR-creation)
- Per-workflow commit-mode override (per-workflow `commit:` key in YAML)
- Remote CI gating, parallel PR queuing, deployment hooks
- Auto-merge polling (belonged to `pr.sh`, deferred to `worktree-pr` cycle)
- Engine startup orphan-row cleanup (separate queued issue)

## Implementation Approach

Vertical delivery: types first → implementation → wire into engine → migrate
workflows → delete dead code → update tests and docs. Each task leaves the
suite passing. The `no_branch` field is removed in Task 4 (after
`run-cycle.ts` is updated to use `cfg.engine.commit.mode`), not before —
avoiding a broken intermediate state.

`commitCycle()` is called by `cli.ts` after a successful `runCycle` return,
not inside `runCycle`. This keeps the engine step-runner pure and commit as an
engine-level post-step action. Commit failure follows the existing
retry/terminal drain path.

---

## Task 1: Add `CommitConfig` type and parse `engine.commit` in `workflow.ts`

### Overview

Extend the config layer with `CommitConfig`, wire it into `EngineConfig` and
`CycleConfig`, and validate it inside `loadConfig()`. This unblocks all
downstream tasks.

### Changes Required

**File**: `src/engine/workflow.ts`

```typescript
// New type — add before EngineConfig
export type CommitConfig = {
  mode: "trunk" | "local-only";
  push: boolean;
};

// Extend EngineConfig
export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
  skip_completed_on_retry?: boolean;
  commit: CommitConfig;           // ← add this
};

// Remove no_branch from Workflow
export type Workflow = {
  name: string;
  description?: string;
  max_cycle_attempts: number;
  // no_branch?: boolean  ← DELETE
  steps: Step[];
};
```

Inside `loadConfig()`, after the existing `engine` object check, add:

```typescript
const COMMIT_DEFAULTS: CommitConfig = { mode: "trunk", push: true };
const rawCommit = parsed.engine.commit;
let commitConfig: CommitConfig;
if (!rawCommit) {
  commitConfig = COMMIT_DEFAULTS;
} else {
  const mode = rawCommit.mode;
  if (mode !== "trunk" && mode !== "local-only") {
    throw new Error(
      `workflows.yml malformed: engine.commit.mode must be "trunk" or "local-only", got "${mode}" (${path})`
    );
  }
  commitConfig = {
    mode,
    push: rawCommit.push !== false,  // default true
  };
}
parsed.engine.commit = commitConfig;
return parsed as CycleConfig;
```

### Success Criteria

- [ ] `tsc --noEmit` passes with the new types
- [ ] `loadConfig()` returns `cfg.engine.commit.mode === "trunk"` when
      `engine.commit` is absent from YAML
- [ ] `loadConfig()` throws with a message containing `"engine.commit.mode"`
      when an unknown mode string is provided
- [ ] Existing workflow tests still pass

---

## Task 2: Implement `commitCycle()` in `src/engine/commit-cycle.ts`

### Overview

New module containing: `stageFiles()` (ports denylist staging logic from
`commit.sh`), `buildClosesBlock()` (ports `closes.sh` logic), and
`commitCycle()` (stages → commits → optionally pushes with 3× retry).

### Changes Required

**File**: `src/engine/commit-cycle.ts` (new)

```typescript
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.js";
import type { CommitConfig } from "./workflow.js";

export type CommitResult =
  | { status: "ok"; sha: string }
  | { status: "skipped"; reason: "nothing_to_commit" }
  | { status: "failed"; reason: "commit_failed" | "push_failed"; attempt?: number };

const DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DENYLIST_EXACT = [".cycle/cycle.pid"];

function isDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}

function isGitlink(p: string, gitlinkPaths: Set<string>): boolean {
  const q = p.replace(/\/$/, "");
  return gitlinkPaths.has(q);
}

function spawnGit(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const env = buildChildEnv({});
  const r = spawnSync("git", args, { cwd, shell: false, encoding: "utf8", env });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Returns true if at least one file was staged.
async function stageFiles(repoRoot: string): Promise<boolean> {
  const env = buildChildEnv({});

  // Collect gitlink paths (mode 160000)
  const lsStage = spawnSync("git", ["ls-files", "--stage"], {
    cwd: repoRoot, shell: false, encoding: "utf8", env,
  });
  const gitlinkPaths = new Set<string>();
  for (const line of (lsStage.stdout ?? "").split("\n")) {
    if (line.startsWith("160000 ")) {
      const parts = line.split("\t");
      if (parts[1]) gitlinkPaths.add(parts[1].trim());
    }
  }

  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repoRoot, shell: false, encoding: "utf8", env,
  });

  for (const raw of (status.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p) || isGitlink(p, gitlinkPaths)) continue;

    const full = join(repoRoot, p);
    const exists = await import("node:fs").then(
      (m) => m.existsSync(full)
    );
    if (!exists) {
      if (xy[0] === "D") continue;          // already-staged deletion
      spawnSync("git", ["add", "-u", "--", p], { cwd: repoRoot, shell: false, env });
    } else {
      spawnSync("git", ["add", "--", p], { cwd: repoRoot, shell: false, env });
    }
  }

  const diff = spawnGit(["diff", "--cached", "--quiet"], repoRoot);
  return !diff.ok;  // non-zero exit = staged changes exist
}

export async function buildClosesBlock(
  issueId: string | undefined,
  repoRoot: string,
): Promise<string> {
  if (!issueId) return "";
  const issuePath = join(repoRoot, "docs/cycle/issues/todo", `${issueId}.md`);
  let body: string;
  try {
    body = await readFile(issuePath, "utf8");
  } catch {
    return "";
  }

  const env = buildChildEnv({});
  const ghResult = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd: repoRoot, shell: false, encoding: "utf8", env,
  });
  const repoSlug = (ghResult.stdout ?? "").trim();
  if (!repoSlug) return "";

  const urlRe = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/g;
  const seen = new Set<string>();
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(body)) !== null) {
    const [, owner, repo, num] = m;
    if (`${owner}/${repo}` === repoSlug && !seen.has(num)) {
      seen.add(num);
      lines.push(`Closes #${num}`);
    }
  }
  return lines.join("\n");
}

export async function commitCycle(
  repoRoot: string,
  opts: {
    cycleId: string;
    title: string;
    issueId?: string;
    config: CommitConfig;
    baseBranch: string;
  },
): Promise<CommitResult> {
  const hasChanges = await stageFiles(repoRoot);
  if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };

  const closes = await buildClosesBlock(opts.issueId, repoRoot);
  const subject = `cycle ${opts.cycleId}: ${opts.title}`;
  const commitArgs = closes
    ? ["commit", "-m", subject, "-m", closes]
    : ["commit", "-m", subject];

  const commitResult = spawnGit(commitArgs, repoRoot);
  if (!commitResult.ok) return { status: "failed", reason: "commit_failed" };

  const shaResult = spawnGit(["rev-parse", "HEAD"], repoRoot);
  const sha = shaResult.stdout.trim();

  if (!opts.config.push) return { status: "ok", sha };

  // Push with 3× retry and exponential backoff (1s, 2s, 4s)
  const BACKOFF_MS = [1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    const pushResult = spawnGit(
      ["push", "origin", opts.baseBranch],
      repoRoot,
    );
    if (pushResult.ok) return { status: "ok", sha };
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    } else {
      return { status: "failed", reason: "push_failed", attempt: attempt + 1 };
    }
  }
  return { status: "failed", reason: "push_failed", attempt: 3 };
}
```

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] `tests/engine/commit-cycle.test.ts` passes with all cases below covered:
  - trunk mode: stages files → commits → pushes to `baseBranch`
  - local-only mode (`push: false`): stages → commits → no `git push` call
  - nothing staged → returns `{ status: "skipped" }`
  - commit failure → returns `{ status: "failed", reason: "commit_failed" }`
  - push retries 3× with backoff; 3rd failure returns `{ status: "failed", reason: "push_failed", attempt: 3 }`
  - `buildClosesBlock()`: mock `gh repo view` + real issue file → appends `Closes #N`
  - `buildClosesBlock()`: missing issue file → returns `""`
  - commit message format matches `cycle {id}: {title}`

---

## Task 3: Wire `commitCycle()` into `cli.ts`

### Overview

Insert `commitCycle()` at both successful `runCycle` return sites. A failed
commit is treated as a cycle failure: skip `drainSuccess`, fall through to
retry/terminal logic.

### Changes Required

**File**: `src/cli.ts`

At the top, add import:
```typescript
import { commitCycle } from "./engine/commit-cycle.js";
```

**Site 1** — resume path (around line 322):
```typescript
if (rr.status === "ok") {
  const cr = await commitCycle(cwd, {
    cycleId: tail.cycleId,
    title: tail.title,
    issueId: tail.issueId,
    config: cfg.engine.commit,
    baseBranch: cfg.engine.base_branch,
  });
  if (cr.status === "failed") {
    // treat commit failure like a step failure
    if (row!.attempt + 1 < maxAttempts) {
      await drainRetry(cwd, log, tail.cycleId, tail.issueId, "commit");
      return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep: "commit" };
    }
    await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, "commit", row!.attempt + 1);
    return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep: "commit" };
  }
  await drainSuccess(cwd, log, todoPath, doneDir, tail.cycleId, tail.issueId);
  return { processed: 1, outcome: "ok" };
}
```

**Site 2** — main drain loop (around line 414):
```typescript
if (r.status === "ok") {
  const cr = await commitCycle(cwd, {
    cycleId,
    title: row.title,
    issueId: row.id,
    config: cfg.engine.commit,
    baseBranch: cfg.engine.base_branch,
  });
  if (cr.status === "failed") {
    if (row.attempt + 1 < maxAttempts) {
      await drainRetry(cwd, log, cycleId, row.id, "commit");
    } else {
      await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, "commit", row.attempt + 1);
    }
  } else {
    await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
    cyclesProcessed++;
    consecutiveFailures = 0;
    failedCycles = [];
    lastHaltContext = undefined;
  }
}
```

Note: `cfg` is already available at both call sites (loaded at line 88).

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] Existing `run-cycle` integration tests still pass (commit sites not
      hit by those tests since they mock `runCycle`)
- [ ] `npm test` passes

---

## Task 4: Replace `no_branch` checks in `run-cycle.ts`

### Overview

Remove all four `wf.no_branch` references in `run-cycle.ts`. Replace with
`cfg.engine.commit.mode`-based dispatch: `trunk` or `local-only` uses
`prepareTrunkArtifactDir`; anything else uses `createCycleBranch` (future
`worktree-pr` path — not implemented this cycle but structurally preserved).

`runCycle()` already calls `loadWorkflow()` → `loadConfig()`. Change it to
call `loadConfig()` directly to get the full `CycleConfig` including
`engine.commit`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Replace `loadWorkflow` import with `loadConfig` (or add it):
```typescript
import { loadConfig } from "./workflow.js";
```

Inside `runCycle()`, replace:
```typescript
const wf = await loadWorkflow(repoRoot, opts.workflow);
```
with:
```typescript
const cfg = await loadConfig(repoRoot);
const wf = cfg.workflows.find((w) => w.name === opts.workflow);
if (!wf) throw new Error(`unknown workflow: ${opts.workflow}`);
```

Replace all four `wf.no_branch` guards with `cfg.engine.commit.mode !== "worktree-pr"`:
- Line 110: `if (wf.no_branch)` → `if (cfg.engine.commit.mode !== "worktree-pr")`
- Line 117: `if (wf.no_branch)` → `if (cfg.engine.commit.mode !== "worktree-pr")`
- Line 156: `if (isResetEligible && !wf.no_branch)` → `if (isResetEligible && cfg.engine.commit.mode === "worktree-pr")`
- Line 239 (finally block): `if (!wf.no_branch)` → `if (cfg.engine.commit.mode === "worktree-pr")`

This preserves correct behavior: `trunk` and `local-only` use
`prepareTrunkArtifactDir` and skip branch checkout/reset logic.
`worktree-pr` (future) uses `createCycleBranch` and the reset-eligible logic.

### Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] All existing `run-cycle.test.ts` tests still pass (they write
      `workflows.yml` without `engine.commit`; defaults apply → `mode: trunk`)
- [ ] `npm test` passes

---

## Task 5: Workflow migration and script deletion

### Overview

Remove `commit`/`pr` steps from all workflow definitions. Add `engine.commit`
block. Delete four obsolete bash scripts. Run `sync-defaults`. Update
`.cycle/workflows.yml` comments.

### Changes Required

**File**: `src/defaults/workflows.yml`

Add to `engine` section:
```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master
  commit:
    mode: trunk
    push: true
```

Remove from `feature` steps: `commit` (line 22) and `pr` (line 23).
Remove from `quickfix` steps: `commit` (line 34) and `pr` (line 35).
Remove from `e2e-tests` steps: `commit` (line 48). Also remove `no_branch: true`
from `e2e-tests` workflow (the engine.commit.mode now owns this semantics).

**File**: `.cycle/workflows.yml`

Add `engine.commit: { mode: trunk, push: true }` to `engine` section.
Remove `commit` step from all four workflows (`feature`, `document`,
`quickfix`, `e2e-tests`). Remove `no_branch: true` from all four workflows.
Update the header comment to reference engine-managed commit instead of the
local-divergence note (which is now moot — both files are trunk).

**Delete these files**:
- `src/defaults/scripts/commit.sh`
- `src/defaults/scripts/commit-trunk.sh`
- `src/defaults/scripts/pr.sh`
- `src/defaults/scripts/lib/closes.sh`

**Run**: `npm run sync-defaults` — copies `src/defaults/` → `.cycle/`.
Note: `.cycle/workflows.yml` was manually maintained; after sync-defaults,
verify the `.cycle/workflows.yml` ends up correct (the sync overwrites it,
so the engine.commit block and removal of no_branch/commit steps will now
come from src/defaults/).

### Success Criteria

- [ ] `src/defaults/scripts/{commit.sh,commit-trunk.sh,pr.sh,lib/closes.sh}`
      do not exist
- [ ] `npm run sync-defaults` exits 0
- [ ] Neither `workflows.yml` contains `commit` or `pr` steps
- [ ] Neither `workflows.yml` contains `no_branch` fields
- [ ] Both `workflows.yml` contain `engine.commit: { mode: trunk, push: true }`
- [ ] `npm test` passes (test suite may fail on deleted-script tests — handled in Task 6)

---

## Task 6: Test cleanup — delete obsolete tests, update step-order assertions

### Overview

Delete five test files that tested now-deleted bash scripts. Update two
step-order assertion tests to reflect the removed `commit`/`pr` steps. Add
missing coverage for `commit-cycle.ts`.

### Changes Required

**Delete these test files**:
- `tests/defaults/commit_sh.test.ts`
- `tests/defaults/commit-staging.test.ts`
- `tests/defaults/closes-linkage.test.ts`
- `tests/defaults/pr-auto-merge-fallback.test.ts`
- `tests/defaults/pr-restart-tolerance.test.ts`

**File**: `tests/defaults/feature-yaml.test.ts` (line 11)

Update the step array assertion to remove `"commit"` and `"pr"`:
```typescript
// Before:
["spec","research","plan","build","review","fix","verify","commit","pr","documentation"]
// After:
["spec","research","plan","build","review","fix","verify","documentation"]
```

**File**: `tests/defaults/quickfix-yaml.test.ts` (lines 12, 23)

Update both assertions to remove `"commit"` and `"pr"`:
```typescript
// Before (src/defaults quickfix):
["plan_fix","quick_fix","test_fix","verify","commit","pr"]
// After:
["plan_fix","quick_fix","test_fix","verify"]

// Before (.cycle quickfix):
["plan_fix","quick_fix","test_fix","verify","commit"]
// After:
["plan_fix","quick_fix","test_fix","verify"]
```

**File**: `tests/engine/commit-cycle.test.ts` (new — created in Task 2)

This is the primary new test file. Test structure:
```typescript
// Each test: mkdtemp → git init → write workflows.yml → call module → cleanup
// Fake git/gh: executable bash scripts in tmp/bin/ prepended to PATH via buildChildEnv
```

Key test cases:
1. `trunk mode — commits and pushes` — fake git records calls; fake gh returns slug
2. `local-only mode — commits, no push` — verify no git push call
3. `nothing staged — returns skipped` — fake git status returns empty
4. `commit fails — returns failed/commit_failed` — fake git commit exits 1
5. `push retry — 3 failures returns failed/push_failed` — fake git push exits 1 always
6. `push retry — succeeds on 2nd attempt` — fake git push exits 1 once then 0
7. `closes block — appended when gh returns slug + issue file exists`
8. `closes block — skipped when issue file missing`
9. `closes block — skipped when gh fails`

**File**: `tests/engine/workflow.test.ts`

Add three new test cases:
1. `engine.commit present — parsed correctly`
2. `engine.commit absent — defaults to mode:trunk push:true`
3. `engine.commit unknown mode — throws at parse time`

### Success Criteria

- [ ] `npm test` passes with 0 failures
- [ ] No test file references a deleted bash script
- [ ] `commit-cycle.test.ts` exists and all 9 cases pass
- [ ] `workflow.test.ts` has 3 new passing cases for commit config

---

## Task 7: Documentation update

### Overview

Add `engine.commit` lifecycle section to `docs/ENGINE.md`. This is the last
task because it documents behavior after it's implemented and verified.

### Changes Required

**File**: `docs/ENGINE.md`

Add new section after whatever currently ends the file (or after the
"Retry skip" section — check placement):

```markdown
## Engine-Managed Commit Lifecycle

After all workflow steps complete with `status: ok`, the engine calls
`commitCycle()` before marking the cycle as done. This is not a workflow
step — it cannot be reordered or skipped via workflow YAML.

### `engine.commit` config shape

```yaml
engine:
  commit:
    mode: trunk        # "trunk" | "local-only" (default: trunk)
    push: true         # boolean (default: true)
```

### Modes

| Mode | Behavior |
|---|---|
| `trunk` | Stage → commit → push to `engine.base_branch` with 3× retry |
| `local-only` | Stage → commit — no push |

### Push retry

Trunk mode retries push up to 3 times with exponential backoff (1s, 2s, 4s).
A persistent push failure counts toward `engine.max_consecutive_failures`.

### Staging denylist

The following paths are never staged regardless of git status:
`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`, gitlinks.

### Closes-block generation

When `CYCLE_ISSUE_ID` is set and the issue file exists at
`docs/cycle/issues/todo/<id>.md`, `commitCycle()` extracts GitHub issue URLs
matching the current repo slug and appends `Closes #N` lines to the commit
message footer.
```

### Success Criteria

- [ ] `docs/ENGINE.md` contains new section with mode table, push retry
      description, staging denylist, and closes-block explanation
- [ ] No references to `commit.sh` or `commit-trunk.sh` remain in
      `docs/ENGINE.md`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] engine.commit parses correctly from both src/defaults/workflows.yml and .cycle/workflows.yml; unknown mode throws at parse time` | Task 1 | `loadConfig()` validates mode; Task 6 adds workflow.test.ts cases |
| `[ ] Engine calls commitCycle() after a successful cycle run — verified by integration test or test double` | Task 3 | Wired at both runCycle call sites in cli.ts; Task 6 commit-cycle.test.ts covers the function |
| `[ ] Push retries up to 3× with backoff; fourth failure marks cycle as failed` | Task 2, Task 3 | commitCycle() implements retry; cli.ts routes failure to drainRetry/terminalDrain |
| `[ ] Commit message matches cycle {id}: {title} format` | Task 2 | Verified in commit-cycle.test.ts case 1 |
| `[ ] local-only mode commits without any push attempt` | Task 2 | Verified in commit-cycle.test.ts case 2 |
| `[ ] no_branch field absent from schema, defaults, and all TypeScript types` | Task 1, Task 4 | Removed from Workflow type (Task 1); all 4 run-cycle.ts callsites replaced (Task 4) |
| `[ ] Obsolete scripts deleted; sync-defaults copies the updated defaults without them` | Task 5 | Four scripts deleted; sync-defaults run and verified |
| `[ ] Workflow commit/pr steps removed from both workflows.yml files` | Task 5 | Both files updated; Task 6 updates step-order assertions |
| `[ ] All existing tests still pass (npm test)` | Tasks 1–6 each require npm test green | Verified after each task |
| `[ ] Coverage does not decrease vs. baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)` | Task 6 | commit-cycle.test.ts added; deleted bash tests replaced by TypeScript coverage |
| `[ ] No compiler warnings (npm run typecheck)` | Tasks 1–4 each require typecheck green | Verified after type changes |

---

## Testing Strategy

### Unit Tests

**`tests/engine/commit-cycle.test.ts`** (new):
- Pattern: `mkdtemp` → `git init --initial-branch=master` → write
  `workflows.yml` → write fake `git`/`gh` executables to `tmp/bin/` →
  call `commitCycle()` → assert call log → cleanup in `finally`.
- Fake git records every invocation to a tmpfile; test reads and asserts.
- Fake gh script: exits 0 and prints a hardcoded slug, or exits 1.
- No mock libraries — follows existing pattern in `run-cycle.test.ts`.

**`tests/engine/workflow.test.ts`** (extend):
- 3 new cases for `engine.commit` parsing (present, absent→defaults, bad mode).

### Integration / E2E Tests

- Full suite (`npm test`) run after each task serves as the integration gate.
- Task 5 specifically verifies `sync-defaults` runs clean and the output
  files contain no `commit`/`pr` steps.

## Risk Assessment

- **`sync-defaults` overwrites `.cycle/workflows.yml`**: After Task 5 runs
  `sync-defaults`, the `.cycle/` file comes from `src/defaults/`. This is
  intentional — the divergence comment is removed because both files now
  match. Verify the sync output explicitly.
- **`run-cycle.ts` internal `loadConfig()` call adds one extra file read per
  cycle**: Negligible overhead; `loadWorkflow()` already did this. No
  structural risk.
- **Deleted test files reduce total test count**: 5 files deleted. The net
  count after Task 6 should be higher (9 new cases in commit-cycle.test.ts
  + 3 in workflow.test.ts vs 5 deleted files). Verify coverage gate still
  passes.
- **`no_branch` removal in `.cycle/workflows.yml` before Task 4**: Tasks are
  ordered to change `run-cycle.ts` (Task 4) before the workflow YAML files
  (Task 5). This ensures the engine never reads `no_branch: false` where it
  expects `cfg.engine.commit.mode`.
```
