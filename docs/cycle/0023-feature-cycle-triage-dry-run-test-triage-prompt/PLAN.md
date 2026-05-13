Have full context. Writing plan to stdout.

```markdown
# Implementation Plan: Cycle 0023

## Overview
Add `cycle triage --dry-run` — a read-only CLI subcommand that re-runs the per-raw triage retry loop against current `docs/cycle/issues/raw/`, prints a structured per-raw JSON report to stdout, exits non-zero on any validation failure, and leaves the filesystem byte-identical to its pre-run state.

## Current State (from Research)
- `src/engine/triage.ts:67` `runTriage(repoRoot, cfg, log, deps?)` owns the per-raw retry loop (`MAX_ATTEMPTS=3`), the validator, and every mutator (`applyRaw`, `bumpAttempts`, `moveToFailed`, `rewriteOrdering`).
- Validator `validateOutput` (`src/engine/triage.ts:279-475`) is pure — already free of I/O and reusable.
- Agent runner `runClaudecodeAgent` is injectable through `deps.runAgent` (used by every triage test).
- CLI router is a flat if-chain in `src/cli.ts:37-67`; handlers like `init`/`status` live in `src/cli/<name>.ts` and are dynamically imported.
- `createLogger` always writes to `.cycle/log.jsonl`, so dry-run must not pass one.
- `bumpAttempts` mutates `raw/<id>.md` on every failed attempt — gating only `applyRaw`/`moveToFailed` is insufficient.
- Coverage baseline: line ≥ 95 %, branch ≥ 75 %, function ≥ 90 %.

## Desired End State
- `node dist/cycle.js triage --dry-run` runs the configured triage agent per raw, prints `Array<{raw_id, status, attempts, last_error?, children?}>` as 2-space-indent JSON, exits 0 if every raw passes validation, 1 otherwise.
- `node dist/cycle.js triage --help` prints the no-side-effects contract.
- `node dist/cycle.js triage` (no flag) prints usage and exits 2 — non-dry handle is explicitly out of scope.
- Existing `runTriage` behavior is unchanged. Verified by: full pre-existing test suite still green, plus a new end-to-end byte-identity test on `raw/ todo/ done/ tbd.jsonl log.jsonl`.

## What We're NOT Doing
- Non-dry `cycle triage` (engine loop still owns real triage; out of scope per issue).
- Writing the report to a file (stdout only).
- Adding `ordering` or `decomposed_parents` to the report (SPEC fixes the schema).
- A general `--help` framework for other subcommands — `triage --help` is scoped and inline.
- Refactoring `validateOutput` or the agent runner.
- Changing `bootstrapArchiveIfLegacy` (the dry-run path simply never calls it).

## Implementation Approach
Refactor `runTriage`'s per-raw retry block into an internal shared helper `processRawWithRetry(raw, ctx)` that returns `{status, parsed?, lastError?, attempts}` and performs zero disk I/O. Then:
- `runTriage` keeps its outer shell (legacy archive, queue read, ordering rewrite, paused emission) and calls the helper, layering the mutators on its result.
- A new export `dryRunTriage(repoRoot, cfg, deps?)` calls the helper directly for each raw and returns `DryRunReport[]`. No logger argument, no mutators, no `bootstrapArchiveIfLegacy`, no directory creation.
- A new `src/cli/triage.ts` handler parses `--dry-run` / `--help`, loads config, invokes `dryRunTriage`, prints JSON, returns the exit code.
- `src/cli.ts` gains one `if (argv[0] === "triage")` branch that dynamic-imports the handler.

This keeps `runTriage`'s contract identical (existing tests untouched), confines all new branches to one helper plus one new entrypoint, and minimizes the duplicated retry-loop bookkeeping.

---

## Task 1: Extract shared per-raw retry helper

### Overview
Pull the per-raw retry loop out of `runTriage` into a pure(-ish) helper that does prompt rendering, agent invocation, exit-code check, validation, and retry feedback — but no filesystem writes. `runTriage` keeps its disk-mutating finalization in place.

### Changes Required
**File**: `src/engine/triage.ts`

Add internal type:
```ts
type RawAttemptOutcome =
  | { status: "ok"; parsed: ParsedTriageOutput; attempts: number }
  | { status: "failed"; lastError: string; attempts: number };

interface ProcessCtx {
  cfg: CycleConfig;
  promptTemplate: string;
  queueRows: TbdRow[];   // snapshot per attempt is fine; passed in
  todoIds: Set<string>;
  runAgent: TriageDeps["runAgent"];
}
```

Add helper `processRawWithRetry(raw: RawIssue, ctx: ProcessCtx): Promise<RawAttemptOutcome>` that:
- Loops `attempt` from 1 to `MAX_ATTEMPTS`.
- Renders the prompt with the current `raw` plus the previous attempt's validator error appended on attempts 2+.
- Calls `ctx.runAgent(prompt, ctx.cfg, repoRoot)` — wait, `runAgent` already has the right signature; thread `repoRoot` through `ctx` as well.
- On non-zero exit: record `lastError = "agent exited <code>: <stderr-tail>"`, continue.
- On zero exit: call `validateOutput(stdout, [raw], queueRows, cfg, todoIds)`; on `ok: false` record `lastError = reason`, continue; on `ok: true` return `{status: "ok", parsed, attempts}`.
- After loop: return `{status: "failed", lastError, attempts: MAX_ATTEMPTS}`.

Refactor `runTriage` (lines ~106-198) to:
1. Build a single `ProcessCtx` once (config, prompt template, current queueRows, todoIds, runAgent, repoRoot).
2. For each `raw`: re-read fresh `queueRows` and `todoIds` (preserves existing per-attempt freshness), call `processRawWithRetry`.
3. Branch on outcome:
   - `ok`: call `applyRaw(...)`, emit `triage.raw.ok`.
   - `failed`: for the entire failed iteration, mirror the existing on-failure path — call `bumpAttempts` per attempt is no longer in the loop, so instead call `bumpAttempts(srcPath, raw.attempts + outcome.attempts)` once at the end, then `moveToFailed` if `raw.attempts + outcome.attempts >= MAX_ATTEMPTS` (which is true today since the helper exhausts retries). Emit `triage.raw.failed` with `outcome.lastError`.
4. Keep ordering rewrite + `engine.paused` emission unchanged.

Note: existing code currently calls `bumpAttempts` after each failed attempt. The refactor consolidates this to one write per raw — outcome equivalent (final `triage_attempts` value on the file is the same; intermediate disk state during the loop differs only for an externally-interrupted run, which is not a behavior contract).

If preserving intermediate `bumpAttempts` writes matters for resume tolerance: add an optional `onAttemptFailed?: (n: number) => Promise<void>` callback to `ProcessCtx`. `runTriage` passes one that calls `bumpAttempts`; `dryRunTriage` omits it.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Full pre-existing `tests/engine/triage.test.ts` suite passes unchanged.
- [ ] No new public exports beyond what Task 2 adds.
- [ ] `runTriage`'s emitted events sequence is identical to master for the existing test fixtures.

---

## Task 2: `dryRunTriage` entrypoint

### Overview
New exported function in `src/engine/triage.ts` that runs the helper from Task 1 for every raw and returns the report.

### Changes Required
**File**: `src/engine/triage.ts`

Add the report type at the top:
```ts
export interface DryRunReport {
  raw_id: string;
  status: "ok" | "failed";
  attempts: number;
  last_error?: string;
  children?: string[];
}
```

Add export:
```ts
export async function dryRunTriage(
  repoRoot: string,
  cfg: CycleConfig,
  deps: TriageDeps = {},
): Promise<DryRunReport[]> {
  const runAgent = deps.runAgent ?? runClaudecodeAgent;
  const rawDir = join(repoRoot, "docs/cycle/issues/raw");
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");

  // Read-only loads. Never mkdir, never archive.
  const raws = (await pathExists(rawDir)) ? await loadRaws(rawDir) : [];
  if (raws.length === 0) return [];

  const promptTemplate = await readFile(
    join(repoRoot, ".cycle", cfg.triage.prompt),
    "utf8",
  );
  const reports: DryRunReport[] = [];

  for (const raw of raws) {
    const queueRows = await readQueue(repoRoot); // read-only
    const todoIds = await listTodoIds(todoDir);   // read-only
    const outcome = await processRawWithRetry(raw, {
      repoRoot,
      cfg,
      promptTemplate,
      queueRows,
      todoIds,
      runAgent,
    });
    if (outcome.status === "ok") {
      reports.push({
        raw_id: raw.id,
        status: "ok",
        attempts: outcome.attempts,
        children: outcome.parsed.children.map((c) => c.id),
      });
    } else {
      reports.push({
        raw_id: raw.id,
        status: "failed",
        attempts: outcome.attempts,
        last_error: outcome.lastError,
      });
    }
  }
  return reports;
}
```

Notes:
- `attempts` reports actual agent invocations in this dry-run pass (starts from 0 each run). The on-disk `triage_attempts` field is not consulted for the dry-run report.
- `listTodoIds` is the existing readdir-based helper (already in triage.ts; if private, reuse it).
- `pathExists` is the existing utility (`src/engine/triage.ts` already uses similar guards) — reuse what's there.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] No `await mkdir`, `writeFile`, `rename`, `appendRow`, or `writeQueue` invocations anywhere reachable from `dryRunTriage` (grep verification in tests).
- [ ] Returns `[]` for an empty raw dir without touching disk.

---

## Task 3: Engine-level tests for `dryRunTriage`

### Overview
Unit-test the new entrypoint directly against an in-memory agent stub, asserting on returned reports and on filesystem byte-identity.

### Changes Required
**File**: `tests/engine/triage-dry-run.test.ts` (new)

Reuse `setupRepo`, `makeConfig`, `rawBody`, `decomposeJson`, `enrichJson` from `tests/engine/triage.test.ts:23-122` (export them if currently file-local, or duplicate the small helpers — preference: extract to `tests/engine/triage-fixtures.ts` and re-import).

Test cases:
1. **Happy path** — three raws, agent stub returns a valid decomposition for each → report has three entries all `status: "ok"`, `children` populated, `attempts: 1` each.
2. **Retry then succeed** — agent returns malformed JSON on attempt 1 then valid on attempt 2 → report `status: "ok"`, `attempts: 2`.
3. **All retries fail** — agent always returns invalid JSON → report `status: "failed"`, `attempts: 3`, `last_error` populated, no exception thrown.
4. **Agent non-zero exit** — `runAgent` returns `{exitCode: 1, stdout: "", stderr: "boom"}` → report `status: "failed"`, `last_error` mentions "agent exited 1" and includes a stderr fragment.
5. **Byte-identity** — before the call, hash `raw/`, `todo/`, `done/`, `failed/` contents + read `tbd.jsonl` and `log.jsonl` byte buffers. After `dryRunTriage` returns, re-read and assert identical. Verify by:
   - For each existing file: `assert.equal(after, before)` on byte buffers.
   - For each directory: assert same readdir set.
   - Assert `.cycle/log.jsonl` size unchanged (or still absent).
6. **Empty raw dir** — returns `[]`, no exceptions, no directory creation.

### Success Criteria
- [ ] All six tests green.
- [ ] Coverage of new `dryRunTriage` + `processRawWithRetry` ≥ 95 % lines, ≥ 90 % branches per-file.
- [ ] Byte-identity test passes against a populated `tbd.jsonl` and `log.jsonl` (write fixtures before the call).

---

## Task 4: CLI handler — `src/cli/triage.ts`

### Overview
New CLI handler mirroring `src/cli/status.ts`'s shape: pure-ish, returns `{exitCode, stdout}`, no `process.exit` inside.

### Changes Required
**File**: `src/cli/triage.ts` (new)

```ts
import { loadConfig } from "../engine/workflow.ts";
import { dryRunTriage } from "../engine/triage.ts";

const HELP = `Usage: cycle triage --dry-run [--help]

Re-run the configured triage agent against every file in
docs/cycle/issues/raw/ and print a per-raw report as JSON.

The --dry-run mode performs no filesystem mutations:
  - no writes under docs/cycle/issues/{raw,todo,done,failed}
  - no appends/rewrites to .cycle/tbd.jsonl
  - no writes to .cycle/log.jsonl

Exits 0 if every raw passed validation, 1 otherwise.

Note: cycle triage without --dry-run is not implemented;
real triage runs as part of \`cycle run\`.`;

export async function runCliTriage(
  repoRoot: string,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { exitCode: 0, stdout: HELP };
  }
  if (!argv.includes("--dry-run")) {
    return { exitCode: 2, stdout: "", stderr: HELP };
  }
  const cfg = await loadConfig(repoRoot);
  const reports = await dryRunTriage(repoRoot, cfg);
  const anyFailed = reports.some((r) => r.status === "failed");
  return {
    exitCode: anyFailed ? 1 : 0,
    stdout: JSON.stringify(reports, null, 2) + "\n",
  };
}
```

**File**: `src/cli.ts`

Add one branch after the `drop` block in the subcommand router (~line 60):
```ts
if (argv[0] === "triage") {
  const { runCliTriage } = await import("./cli/triage.ts");
  const result = await runCliTriage(repoRoot, argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `node dist/cycle.js triage --help` prints help, exits 0.
- [ ] `node dist/cycle.js triage` prints help on stderr, exits 2.
- [ ] `node dist/cycle.js triage --dry-run` invokes `dryRunTriage` and prints JSON.

---

## Task 5: CLI end-to-end tests

### Overview
Mirror `tests/cli/triage.test.ts`'s fake-`claude`-on-PATH harness to assert the bundled CLI behaves correctly end-to-end.

### Changes Required
**File**: `tests/cli/triage-dry-run.test.ts` (new)

Test cases:
1. **Help text** — `node dist/cycle.js triage --help` prints help describing the no-side-effects contract; exit 0.
2. **No flag exits 2** — `node dist/cycle.js triage` prints help on stderr, exit 2.
3. **Happy path, exit 0** — temp repo with two raws, fake `claude` returns valid decompose JSON for each → stdout parses as JSON array with both `status: "ok"`; exit 0.
4. **Validation failure, exit 1** — fake `claude` returns invalid JSON (e.g., empty `children`) → stdout JSON has at least one `status: "failed"` with `last_error`; exit 1.
5. **Byte-identity (E2E)** — snapshot every file under `docs/cycle/issues/`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl` before; run `triage --dry-run`; assert all snapshots match after. Crucially: assert `.cycle/log.jsonl` was not appended to (compare size/contents).

Reuse the fake-`claude` shell-script helper from `tests/cli/triage.test.ts`.

### Success Criteria
- [ ] All five tests pass.
- [ ] Coverage report (post-build) shows no regression vs master baseline (line ≥ 95 %, branch ≥ 75 %, func ≥ 90 %).
- [ ] `src/cli/triage.ts` per-file coverage ≥ 90 % line / branch / func.

---

## Testing Strategy

### Unit Tests (`tests/engine/triage-dry-run.test.ts`)
- Six cases listed in Task 3, covering happy path, single retry, full retry exhaustion, agent non-zero exit, byte-identity, empty raw dir.
- Mock surface: only `deps.runAgent` (a closure that returns canned `TriageAgentResult`). Real filesystem, real `loadRaws`, real `validateOutput`, real `readQueue`. Anti-mock bias preserved.

### Integration / E2E Tests (`tests/cli/triage-dry-run.test.ts`)
- Five cases listed in Task 5, all exercising the bundled `dist/cycle.js` against a temp repo with a fake `claude` binary on PATH. No mocking inside the CLI process — full subprocess behavior.

### Existing-Test Regression
- Whole `npm test` must remain green: confirms the Task 1 refactor preserved `runTriage` behavior on its existing fixtures.

## Risk Assessment

- **Refactor changes `bumpAttempts` write cadence (per-attempt → once at end)**: pre-existing crash-mid-loop tolerance is mildly weakened. Mitigation: add the optional `onAttemptFailed` callback to `ProcessCtx` so `runTriage` keeps per-attempt writes; only `dryRunTriage` omits it. Tests for `runTriage`'s per-attempt frontmatter writes (if any exist in master) will catch a regression.
- **Real agent spawned in dry-run can still mutate the repo via its own side effects** (the `claude` binary is the user's real agent, not sandboxed). SPEC's "no side effects" applies to engine code; the agent's own behavior is out of our control. Document this in the `--help` text — already covered by the "performs no filesystem mutations" wording, but clarify the scope is "engine actions".
- **`dryRunTriage` skipping `bootstrapArchiveIfLegacy` means a first-run repo with a legacy `tbd.jsonl` reports stale queue rows**: acceptable — dry-run is a diagnostic harness, not a first-time bootstrap path; document only if a test trips on it.
- **CLI help bytes shifting break grep-style tests**: keep help-text-asserting tests substring-based (`assert.ok(stdout.includes("performs no filesystem mutations"))`) rather than equality.
```

Plan emitted to stdout for engine capture.
