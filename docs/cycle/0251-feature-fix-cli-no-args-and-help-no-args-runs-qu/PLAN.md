# Implementation Plan: Cycle 0251

## Overview

Fix three broken CLI entry points: `cycle` with no args dispatches queue drain instead of throwing, and `cycle help`, `cycle --help`, and `cycle run --help` all print structured usage and exit 0 cleanly.

## Current State (from Research)

- `src/cli/parse-args.ts:40` — throws `unknown command: (none)` for empty argv and `unknown command: --help` for `argv[0] === "--help"`. No `help` option registered in the `run` nodeParseArgs options, so `cycle run --help` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`.
- `src/cli.ts:85` — `parseArgs(argv)` is called with no prior guard for empty argv, `help`, or `--help`. All existing command guards follow the `if (argv[0] === "<cmd>")` early-exit pattern — this is the established model.
- `tests/cli/parse-args.test.ts` — 11 existing unit tests; no empty-argv, `help`, or `--help` cases.
- No `tests/cli/help.test.ts` exists. Integration test pattern: `spawnSync("node", [dist, ...flags], { cwd, encoding: "utf8" })` with `ensureDist()` to verify the bundle exists; bootstrapped temp repo via `mkdtemp` + `git init`.

## Desired End State

After this cycle:
- `node .cycle/bin/cycle.js` with no args produces `engine.start` in stdout and exits 0.
- `node .cycle/bin/cycle.js help`, `--help`, and `run --help` all print the usage block (containing `cycle — issue-driven workflow engine`) and exit 0.
- `parseArgs([])` returns `{ command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false }`.
- `parseArgs(["run", "--help"])` does not throw.
- All 11 existing parse-args tests still pass.
- New test file `tests/cli/help.test.ts` with 5 tests passes under `npm test`.

## What We're NOT Doing

- Subcommand-specific help (e.g., `cycle run --help` showing only run flags).
- Man page or markdown help generation.
- Any `HelpArgs` type in the `ParsedArgs` union — help is intercepted before `parseArgs` is called.
- Changes to any subcommand other than the no-args and help paths.
- Modifying `README.md` or `CLAUDE.md` (the issue explicitly scopes these out).

## Implementation Approach

Two-layer fix. **Layer 1** (`src/cli/parse-args.ts`): treat empty argv as `run` by narrowing the throw guard to `argv.length > 0 && argv[0] !== "run"`, and register `help: { type: "boolean", default: false }` in the `run` options map. **Layer 2** (`src/cli.ts`): add a help intercept block before the `parseArgs` call site, following the established `argv[0]` guard pattern. The `argv.includes("--help")` check in that block covers `cycle run --help` — belt-and-suspenders with the parse-args registration which covers the unit-test-level `parseArgs(["run", "--help"])` criterion.

Design choice for `parseArgs(["--help"])`: `--help` alone is intercepted upstream in `cli.ts` before `parseArgs` is called; `parseArgs(["--help"])` therefore still throws `unknown command: --help`. The unit test documents this with an explicit assertion.

---

## Task 1: Fix `src/cli/parse-args.ts` — empty-argv default and help option

### Overview

Two targeted changes: (1) change the throw guard so empty argv falls through to the `run` branch and returns default `RunArgs`, and (2) register `help` in the run options map so `nodeParseArgs` never throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` on `--help`.

### Changes Required

**File**: `src/cli/parse-args.ts`

**Change 1** — line 40, narrow the throw guard:

```typescript
// Before:
if (argv[0] !== "run") throw new Error(`unknown command: ${argv[0] ?? "(none)"}`);

// After:
if (argv.length > 0 && argv[0] !== "run") throw new Error(`unknown command: ${argv[0]}`);
```

Empty argv now falls through. `argv.slice(1)` is `[]`, nodeParseArgs with empty args returns all defaults, `positionals` is `[]`, `text` is `""` → `null`. Return value: `{ command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false }`.

**Change 2** — lines 44–49, add `help` to the run options:

```typescript
options: {
  workflow: { type: "string", default: "feature" },
  "dry-run": { type: "boolean", default: false },
  "no-skip-completed": { type: "boolean", default: false },
  trunk: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
},
```

The `help` value is consumed by the `nodeParseArgs` machinery and ignored in the return — `RunArgs` type does not change, no new field needed.

### Success Criteria

- [ ] `parseArgs([])` returns `{ command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false }` (verified by new unit test in Task 3)
- [ ] `parseArgs(["run", "--help"])` returns a `RunArgs` without throwing (verified by new unit test in Task 3)
- [ ] `parseArgs(["wat"])` still throws `unknown command: wat` (existing test passes)
- [ ] `npm run typecheck` passes with no errors

---

## Task 2: Add help/`--help` intercept to `src/cli.ts`

### Overview

Insert a single guard block immediately before line 85 (`const args = parseArgs(argv)`) that catches all three help-invocation forms and prints the exact usage block from the issue, then exits 0. Follows the established `argv[0]` guard pattern.

### Changes Required

**File**: `src/cli.ts`

Insert after the `cleanup` block (after line 84) and before `const args = parseArgs(argv)`:

```typescript
if (argv[0] === "help" || argv[0] === "--help" || argv.includes("--help")) {
  console.log(`cycle — issue-driven workflow engine for autonomous code changes

Usage:
  cycle [run] [<task>] [flags]  Triage and run the queue (optionally add a freeform task first)
  cycle drop <task>             Add a freeform task to the inbox without running
  cycle status                  Print queue counts and in-flight state
  cycle triage [--dry-run]      Re-run triage diagnostics
  cycle cleanup [--dry-run] [--yes] [--force]
                                List or delete orphaned cycle/* branches
  cycle help                    Show this help

Flags for run:
  --workflow <name>             Force a workflow (default: feature)
  --dry-run                     Preview triage/queue; no execution
  --no-skip-completed           Re-derive pre-build artifacts on retry
  --trunk                       Commit to base branch instead of per-cycle branches

  --version                     Print version and exit
  --help                        Show this help`);
  process.exit(0);
}
```

**Why `argv.includes("--help")` catches `run --help`**: `argv` at this point is `["run", "--help"]`. `argv[0]` is `"run"` — falls through the first two checks. `argv.includes("--help")` is `true` → prints usage and exits before `parseArgs` is ever called. The `run-one` guard at line 71 uses `argv[0] === "run-one"`, not `argv[0] === "run"`, so there is no conflict with `--help` being caught early for `run`.

**Ordering within cli.ts guards**: The help block must come after all specific subcommand guards (`--version`, `init`, `status`, `triage`, `run-one`, `cleanup`) and before `parseArgs`. This ensures `cycle status --help` still runs status (existing behavior preserved), while `cycle run --help` is caught by `includes`. If future subcommands need `--help`-pass-through behavior, they add their own pre-guard before this block.

### Success Criteria

- [ ] `node .cycle/bin/cycle.js help` → stdout contains `cycle — issue-driven workflow engine`, exit 0
- [ ] `node .cycle/bin/cycle.js --help` → stdout contains `cycle — issue-driven workflow engine`, exit 0
- [ ] `node .cycle/bin/cycle.js run --help` → stdout contains `cycle — issue-driven workflow engine`, exit 0
- [ ] `node .cycle/bin/cycle.js status` → still runs status (not intercepted by help guard)
- [ ] `npm run build` succeeds

---

## Task 3: Unit tests — `tests/cli/parse-args.test.ts`

### Overview

Add three new test cases to the existing file. Two cover the new behavior (empty argv, `run --help`); one documents the design choice for `parseArgs(["--help"])`.

### Changes Required

**File**: `tests/cli/parse-args.test.ts`

Append after the existing `--trunk defaults to false` test (after line 69):

```typescript
test("parses [] (no args) — defaults to run drain-only mode", () => {
  const r = parseArgs([]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false });
});

test("parseArgs(['run', '--help']) does not throw ERR_PARSE_ARGS_UNKNOWN_OPTION", () => {
  assert.doesNotThrow(() => parseArgs(["run", "--help"]));
  const r = parseArgs(["run", "--help"]);
  assert.equal(r.command, "run");
});

test("parseArgs(['--help']) — handled upstream in cli.ts, throws at parse-args level", () => {
  // --help with no 'run' prefix is intercepted before parseArgs in cli.ts.
  // At the parse-args level it is still an unknown command.
  assert.throws(() => parseArgs(["--help"]), /unknown command/);
});
```

### Success Criteria

- [ ] All 14 tests in `tests/cli/parse-args.test.ts` pass
- [ ] The `parseArgs([])` test asserts the full exact shape (deepEqual), not just `command: "run"`

---

## Task 4: Integration tests — `tests/cli/help.test.ts` (new file)

### Overview

New integration test file exercising all four acceptance-criterion invocations via `spawnSync` against the built `dist/cycle.js`. Help tests need no bootstrapped repo (exit before engine startup). The no-args test requires a minimal bootstrapped repo so the engine can acquire a lock and emit `engine.start`.

### Changes Required

**File**: `tests/cli/help.test.ts` (create)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const USAGE_SENTINEL = "cycle — issue-driven workflow engine";

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const MINIMAL_WORKFLOW = `engine:
  base_branch: main
  commit:
    mode: trunk
    push: false
workflows:
  - name: feature
    steps: []
`;

async function bootstrapMinimal(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
  const cycleDir = join(root, ".cycle");
  await mkdir(cycleDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), MINIMAL_WORKFLOW, "utf8");
  for (const d of ["raw", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

test("cycle help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL), `expected sentinel in stdout: ${r.stdout}`);
});

test("cycle --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("cycle run --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "run", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("usage output lists all six subcommands", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const cmd of ["run", "drop", "status", "triage", "cleanup", "help"]) {
    assert.ok(r.stdout.includes(cmd), `expected '${cmd}' in usage output`);
  }
});

test("cycle with no args begins queue drain — emits engine.start and exits 0", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-no-args-"));
  try {
    await bootstrapMinimal(root);
    const r = spawnSync("node", [dist], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('"event":"engine.start"'),
      `expected engine.start in stdout: ${r.stdout}`,
    );
    assert.ok(
      !r.stderr.includes("unknown command"),
      `unexpected error in stderr: ${r.stderr}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Why no triage section in MINIMAL_WORKFLOW**: `runTriage` is only called when `cfg` is truthy. With `workflows.yml` present, `cfg` is truthy. But `runTriage` checks `raw/` for `.md` files — there are none, so it returns `{ status: "ok" }` immediately without calling any agent or reading a prompt file. The `triage:` key in workflows.yml is optional at the YAML level; omitting it avoids any prompt file read.

**Why `timeout: 15000`**: The no-args engine run acquires a lock, emits events, and drains an empty queue — should complete in under 2 seconds. 15s is the outer bound matching existing integration test patterns; CI will not hang.

**Temp dir cleanup**: `rm` in `finally` block prevents test artifact accumulation in `/tmp`.

### Success Criteria

- [ ] `tests/cli/help.test.ts` auto-discovered by `npm test` (no glob changes needed)
- [ ] All 5 tests in the file pass
- [ ] No-args test exits 0 with `engine.start` in stdout
- [ ] Help tests exit 0 with usage sentinel in stdout
- [ ] Six-subcommand test asserts each of `run`, `drop`, `status`, `triage`, `cleanup`, `help` individually

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] node .cycle/bin/cycle.js` with no args begins queue drain (emits `engine.start` or equivalent, does not throw) | Task 4 | Integration test: bootstrapped temp repo, assert engine.start in stdout and exit 0 |
| `[ ] node .cycle/bin/cycle.js help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0 | Task 4 | Integration test: assert sentinel + exit 0 |
| `[ ] node .cycle/bin/cycle.js --help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0 | Task 4 | Integration test: assert sentinel + exit 0 |
| `[ ] node .cycle/bin/cycle.js run --help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0 | Task 4 | Integration test: assert sentinel + exit 0 |
| `[ ] Usage output lists all six subcommands: run, drop, status, triage, cleanup, help` | Task 4 | Integration test: assert each subcommand name present in stdout |
| `[ ] parseArgs([]) returns { command: "run", ... } without throwing` | Tasks 1 + 3 | Task 1 implements; Task 3 pins via deepEqual unit test |
| `[ ] parseArgs(['run', '--help']) does not throw ERR_PARSE_ARGS_UNKNOWN_OPTION` | Tasks 1 + 3 | Task 1 adds `help` option to nodeParseArgs; Task 3 asserts doesNotThrow |
| `[ ] All existing tests pass` | Tasks 1–4 | Tasks 1–2 preserve existing behavior; Tasks 3–4 add only new tests |
| `[ ] New tests cover: no-args dispatch, help subcommand, --help flag, run --help flag` | Tasks 3 + 4 | Task 3: unit coverage; Task 4: integration coverage for all four invocations |

---

## Testing Strategy

### Unit Tests

**`tests/cli/parse-args.test.ts`** — 3 new cases appended to existing 11:
- `parseArgs([])` → full `deepEqual` to default RunArgs (not just `command: "run"`, catches regression if shape changes)
- `parseArgs(["run", "--help"])` → `doesNotThrow` + `command === "run"` (two assertions)
- `parseArgs(["--help"])` → `throws` with `/unknown command/` (documents upstream-interception design)

No mocking. `parseArgs` is a pure synchronous function; real calls are faster and more reliable than stubs.

### Integration / E2E Tests

**`tests/cli/help.test.ts`** — 5 tests, all using `spawnSync` against `dist/cycle.js`:

1. `cycle help` → sentinel + exit 0 (no repo needed)
2. `cycle --help` → sentinel + exit 0 (no repo needed)
3. `cycle run --help` → sentinel + exit 0 (no repo needed)
4. `cycle help` stdout lists all 6 subcommand names (no repo needed)
5. `cycle` (no args) → `engine.start` in stdout + exit 0 (bootstrapped temp repo with `mkdtemp`)

Mocking: none. `dist/cycle.js` is the real bundle; `bootstrapMinimal` uses real filesystem and real `git init`. `pretest` ensures the bundle is fresh before tests run.

## Risk Assessment

- **`MINIMAL_WORKFLOW` missing required fields**: If `loadConfig` or `runTriage` requires a `triage:` key and errors on absence, the no-args test fails. Mitigation: the triage block is only consulted when `cfg.triage` is accessed; with no raw files, `runTriage` returns early. If this fails in CI, add a `triage: {}` stub to `MINIMAL_WORKFLOW` and verify `runTriage` handles it gracefully.
- **`argv.includes("--help")` intercept capturing unintended invocations**: Any future subcommand that legitimately passes `--help` downstream would be intercepted. Mitigation: future subcommands that need `--help` pass-through must add their own guard before the help block; the `run-one` internal command uses a different name and is not affected.
- **Coverage regression**: `src/cli.ts` has no per-file floor but contributes to aggregate line coverage. The help intercept block is exercised by integration tests. If integration tests don't count toward coverage instrumentation, aggregate may dip slightly. Mitigation: run `npm run test:coverage` and check aggregate numbers; if needed, add a unit-level test for the help text by extracting it to a `USAGE` constant importable from a separate module.
