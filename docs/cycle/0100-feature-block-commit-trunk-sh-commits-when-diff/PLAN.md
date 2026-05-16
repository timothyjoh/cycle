# Implementation Plan: Cycle 0100

## Overview
Add a `src/`-presence guard to `commit-trunk.sh` that blocks artifact-only commits (docs, cycle logs, issue files) by exiting 1 with a specific message when no staged file lives under `src/`. Covered by four integration test scenarios and documented in CLAUDE.md.

## Current State (from Research)
- `commit-trunk.sh` (`src/defaults/scripts/commit-trunk.sh`, 88 lines): empty-diff check at lines 62–65 exits 0 with "nothing to commit"; guard inserts immediately after line 65
- `.cycle/scripts/commit-trunk.sh`: byte-identical to src copy; updated by `npm run sync-defaults` (no divergence guard will fire)
- No existing tests for `commit-trunk.sh`; test pattern to mirror is `tests/defaults/commit-staging.test.ts` (inline `makeRepo`/`runScript`/`commitFiles`/`porcelainPaths` helpers, `node:test`, local bare remote for push scenarios)
- `set -euo pipefail` active in script — guard must use `if !` construct, not bare `grep -q`

## Desired End State
- `commit-trunk.sh` line 66 contains the `src/`-presence guard (`if ! git diff --cached --name-only | grep -q '^src/'`)
- `.cycle/scripts/commit-trunk.sh` byte-identical to src after `sync-defaults`
- `tests/defaults/commit-trunk-artifact-guard.test.ts` has four passing tests
- `npm test` and `npm run test:coverage` pass at baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- CLAUDE.md Architecture quick reference documents the artifact-only guard

## What We're NOT Doing
- Not modifying `commit.sh` (branch-workflow variant — deferred per SPEC)
- Not adding a `verify.sh` post-condition (alternative path, deferred)
- Not modifying `run-cycle.ts` empty-diff guard (separate issue `refl-0080`)
- Not extracting shared test helpers into a module (project convention: helpers stay inline)

## Implementation Approach
Single insertion into the shell script followed by a new test file. The guard uses `git diff --cached --name-only | grep -q '^src/'` wrapped in `if !` to avoid `set -e` false-positive from grep's non-match exit. Push scenarios use a local bare remote (`git init --bare`) so tests verify the commit was made without requiring network access. `sync-defaults` propagates the change deterministically.

---

## Task 1: Add src/-presence guard to commit-trunk.sh

### Overview
Insert the guard block immediately after the empty-diff check (after line 65). Ensures artifact-only commits are blocked before the script sources `lib/closes.sh` or builds the commit message.

### Changes Required
**File**: `src/defaults/scripts/commit-trunk.sh`

Insert after line 65 (`exit 0` of the nothing-to-commit block):

```bash
if ! git diff --cached --name-only | grep -q '^src/'; then
  echo "commit blocked: no src/ changes in staged diff — artifact-only commit suppressed" >&2
  exit 1
fi
```

The result at lines 62–70 becomes:
```bash
if git diff --cached --quiet; then
  echo "commit-trunk.sh: nothing to commit"
  exit 0
fi

if ! git diff --cached --name-only | grep -q '^src/'; then
  echo "commit blocked: no src/ changes in staged diff — artifact-only commit suppressed" >&2
  exit 1
fi

# shellcheck source=lib/closes.sh
. "$(dirname "$0")/lib/closes.sh"
```

### Success Criteria
- [ ] `bash -n src/defaults/scripts/commit-trunk.sh` exits 0 (no syntax errors)
- [ ] Guard is positioned after line 65 (the empty-diff `exit 0`) and before line 68 (`. lib/closes.sh`)
- [ ] Guard message matches SPEC exactly: `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed`
- [ ] `if !` construct used (not bare `grep -q`) — safe under `set -euo pipefail`

---

## Task 2: Mirror change to .cycle via sync-defaults

### Overview
Run `npm run sync-defaults` to copy the updated `commit-trunk.sh` to `.cycle/scripts/commit-trunk.sh`, keeping the dogfood copy byte-identical.

### Changes Required
No code changes — shell command only:
```sh
npm run sync-defaults
```

Verify `.cycle/scripts/commit-trunk.sh` contains the new guard block.

### Success Criteria
- [ ] `.cycle/scripts/commit-trunk.sh` contains the guard block
- [ ] `diff src/defaults/scripts/commit-trunk.sh .cycle/scripts/commit-trunk.sh` exits 0

---

## Task 3: Write integration tests

### Overview
New test file `tests/defaults/commit-trunk-artifact-guard.test.ts` covering all four SPEC scenarios. Uses a local bare remote as `origin` for push scenarios so tests verify the commit was made without network access.

### Changes Required
**File**: `tests/defaults/commit-trunk-artifact-guard.test.ts` (new)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(cwd: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} (cwd=${cwd}) failed [${r.status}]: ${r.stderr}`);
  }
  return r;
}

async function makeRepo(): Promise<{ root: string; bare: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-trunk-guard-"));
  const bare = root + ".bare";
  run(root, "git", ["init", "--bare", "-q", bare]);
  run(root, "git", ["init", "-q"]);
  run(root, "git", ["config", "user.email", "test@example.com"]);
  run(root, "git", ["config", "user.name", "Test"]);
  run(root, "git", ["config", "commit.gpgsign", "false"]);
  run(root, "git", ["remote", "add", "origin", bare]);
  await writeFile(join(root, ".gitignore"), ".cycle/\n");
  await writeFile(join(root, "README.md"), "seed\n");
  run(root, "git", ["add", ".gitignore", "README.md"]);
  run(root, "git", ["commit", "-q", "-m", "seed"]);
  run(root, "git", ["push", "-q", "origin", "master"]);
  const scripts = join(root, ".cycle/scripts");
  await mkdir(join(scripts, "lib"), { recursive: true });
  await copyFile("src/defaults/scripts/commit-trunk.sh", join(scripts, "commit-trunk.sh"));
  await copyFile("src/defaults/scripts/lib/closes.sh", join(scripts, "lib/closes.sh"));
  await chmod(join(scripts, "commit-trunk.sh"), 0o755);
  return { root, bare };
}

function runScript(cwd: string, env: Record<string, string> = {}) {
  return spawnSync("bash", [".cycle/scripts/commit-trunk.sh"], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function commitFiles(cwd: string): string[] {
  const r = run(cwd, "git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  return r.stdout.split("\n").filter((s) => s.length > 0).sort();
}

const ENV = { CYCLE_ID: "0100", CYCLE_TITLE: "guard test" };

// Scenario 1: artifact-only staged diff → exit 1, guard message, no commit
test("blocks artifact-only commit (no src/ in staged diff)", async () => {
  const { root, bare } = await makeRepo();
  try {
    await mkdir(join(root, "docs/cycle/0100-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0100-feature-test/SPEC.md"), "spec\n");
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/todo/test-issue.md"), "issue\n");

    const r = runScript(root, ENV);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(
      r.stderr,
      /commit blocked: no src\/ changes in staged diff — artifact-only commit suppressed/,
    );
    // No new commit made
    const log = run(root, "git", ["log", "--oneline"]).stdout.trim().split("\n");
    assert.equal(log.length, 1, `expected only seed commit, got: ${log}`);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bare, { recursive: true, force: true });
  }
});

// Scenario 2: src/ file staged alone → exit 0, commit made
test("allows commit when src/ file is staged alone", async () => {
  const { root, bare } = await makeRepo();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    const r = runScript(root, ENV);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const files = commitFiles(root);
    assert.ok(files.includes("src/app.ts"), `expected src/app.ts in commit: ${files}`);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bare, { recursive: true, force: true });
  }
});

// Scenario 3: src/ + docs/ staged together → commit includes both paths
test("allows mixed commit (src/ + docs/ together)", async () => {
  const { root, bare } = await makeRepo();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/engine.ts"), "export {};\n");
    await mkdir(join(root, "docs/cycle/0100-feature-test"), { recursive: true });
    await writeFile(join(root, "docs/cycle/0100-feature-test/PLAN.md"), "plan\n");

    const r = runScript(root, ENV);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const files = commitFiles(root);
    assert.ok(files.includes("src/engine.ts"), `expected src/engine.ts: ${files}`);
    assert.ok(
      files.includes("docs/cycle/0100-feature-test/PLAN.md"),
      `expected PLAN.md: ${files}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bare, { recursive: true, force: true });
  }
});

// Scenario 4: empty staged index → exit 0 "nothing to commit", guard not reached
test("exits 0 with nothing-to-commit when staged index is empty", async () => {
  const { root, bare } = await makeRepo();
  try {
    // Only denied files present — after denylist flush, index is empty
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "dist/bundle.js"), "bundle\n");

    const r = runScript(root, ENV);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /commit-trunk\.sh: nothing to commit/);
    // Guard message must NOT appear (nothing-to-commit exits before guard)
    assert.doesNotMatch(r.stderr, /commit blocked/);
    const log = run(root, "git", ["log", "--oneline"]).stdout.trim().split("\n");
    assert.equal(log.length, 1, `expected only seed commit, got: ${log}`);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bare, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Four tests exist and each maps to one SPEC scenario
- [ ] Scenario 1: `r.status === 1` and stderr matches guard message exactly
- [ ] Scenario 2: `r.status === 0` and `src/app.ts` in commit files
- [ ] Scenario 3: `r.status === 0` and both paths in commit files
- [ ] Scenario 4: `r.status === 0`, stdout matches `nothing to commit`, stderr does NOT match `commit blocked`
- [ ] `npm test` passes (all 438+ tests green)

---

## Task 4: Update CLAUDE.md Architecture section

### Overview
Add one bullet documenting the artifact-only guard to the Architecture quick reference section.

### Changes Required
**File**: `CLAUDE.md`

In the Architecture quick reference section, after the `commit-trunk.sh` reference (the "Default workflow + prompts + scripts" bullet or the first mention of `commit-trunk.sh`), add:

```markdown
- Artifact-only guard in `commit-trunk.sh`: after the empty-diff check, exits 1 with `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed` on stderr when the staged diff contains no files under `src/`. Ensures every trunk commit contains at least one real implementation change.
```

Locate the existing `commit-trunk.sh` reference in the Architecture section and append this as a sub-bullet or follow-on sentence. If it's part of the "Default workflow + prompts + scripts" bullet, add it as a new standalone bullet immediately after that line.

### Success Criteria
- [ ] CLAUDE.md contains the guard message verbatim
- [ ] The bullet appears in the Architecture quick reference section (not in Workflow defaults or Commands)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] commit-trunk.sh exits 1 with commit blocked: no src/ changes in staged diff — artifact-only commit suppressed on stderr when staged files are entirely under docs/, .cycle/, or issue directories` | Task 1, Task 3 (Scenario 1) | Guard insertion + test |
| `[ ] commit-trunk.sh exits 0 and commits when at least one staged file is under src/` | Task 1, Task 3 (Scenario 2) | Guard bypass + test |
| `[ ] Mixed commits (src/ + docs/ together) are unaffected — commit proceeds normally` | Task 1, Task 3 (Scenario 3) | Guard bypass + test |
| `[ ] Completely empty staged index still exits 0 with "nothing to commit" (existing behavior preserved)` | Task 1, Task 3 (Scenario 4) | Nothing-to-commit path unchanged + test |
| `[ ] New tests cover all four scenarios above and pass under npm test` | Task 3 | Four tests in new file |
| `[ ] npm run test:coverage meets line ≥ 95% / branch ≥ 75% / function ≥ 90% baseline` | Task 3 | Shell tests don't affect TS coverage; baseline unaffected |
| `[ ] CLAUDE.md Architecture section documents the artifact-only guard in commit-trunk.sh` | Task 4 | |
| `[ ] All existing tests still pass` | Task 3 | Verified by `npm test` |

---

## Testing Strategy

### Unit Tests
N/A — the change is pure shell. No TypeScript logic is added.

### Integration / E2E Tests
- All four tests use real `git` operations (init, commit, diff) in a temp dir — no mocking
- Local bare remote (`git init --bare`) provides a real `origin` for push scenarios (Scenarios 2 and 3) without network
- `commitFiles()` reads `git diff-tree` output to verify commit contents deterministically
- `porcelainPaths()` available but not needed for these scenarios (denylist behavior tested in `commit-staging.test.ts`)
- Bare remote dir cleaned up in `finally` alongside repo root

## Risk Assessment
- **`set -euo pipefail` + grep**: `grep -q` exits 1 on no-match — the `if !` wrapper handles this correctly. If accidentally written as a bare `grep -q`, the script would abort before outputting the message. Test Scenario 1 catches this immediately.
- **`git push` in Scenarios 2/3**: bare remote eliminates network dependency. If `git push` fails for any other reason (e.g., non-fast-forward), test would fail misleadingly — mitigated by seeding the bare remote with the initial push in `makeRepo`.
- **Branch name in push**: `commit-trunk.sh:86` uses `git rev-parse --abbrev-ref HEAD` — `git init` defaults to `master` on this system. Test uses `run(root, "git", ["push", "-q", "origin", "master"])` in `makeRepo` to pre-push the seed commit, making subsequent pushes fast-forward.
- **Coverage baseline**: shell integration tests do not contribute to TypeScript LCOV coverage — the four new tests leave coverage metrics unchanged. No risk of regression.
