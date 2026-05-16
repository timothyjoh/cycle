I have everything needed. Writing the research document now.

```markdown
# Research: Cycle 0113

## Cycle Context
SPEC calls for a pure extraction: lift `terminalDrain` out of `src/cli.ts` into a new file `src/engine/issue-lifecycle.ts`, re-export it, replace the three in-file call sites with an import, and add `tests/engine/issue-lifecycle.test.ts` covering the happy path (mutateFrontmatter succeeds → rename) and the mutateFrontmatter fallback (throws → manual parse/serialize/writeFile/rename/unlink). No behavior changes.

## Current Codebase State

### Relevant Components

- **`terminalDrain` function**: defined at `src/cli.ts:126–198`. Private (not exported). Takes 8 params: `cwd`, `log`, `todoPath`, `failedDir`, `cycleId`, `issueId`, `failingStep: string | undefined`, `failedAttempts: number`. Contains two code paths:
  - **Happy path** (`src/cli.ts:137–194`): calls `mutateFrontmatter(todoPath, ...)` to stamp `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`; on success renames `todoPath` → `failedDir/<issueId>.md`.
  - **Fallback** (`src/cli.ts:148–193`): when `mutateFrontmatter` throws, reads the file raw, calls `parseFrontmatter` (catching parse errors), manually builds a `Frontmatter` object with an extra `drain_error` field, calls `serializeFrontmatter`, writes to a `.tmp` path, atomically renames to `failedPath`, and unlinks the original `todoPath`.
  - Both paths call `drainFailedTerminal`, `propagateBlocked`, and emit `queue.drained` + `issue.failed` log events.

- **Three call sites** in `src/cli.ts`:
  - `src/cli.ts:336` — inside `runResumeOnce`, commit-step failure after maxAttempts
  - `src/cli.ts:346` — inside `runResumeOnce`, workflow-step failure after maxAttempts
  - `src/cli.ts:442` — inside main `while` loop, commit-step failure after maxAttempts
  - `src/cli.ts:463` — inside main `while` loop, workflow-step failure after maxAttempts

- **`src/engine/frontmatter.ts`**: exports `mutateFrontmatter` (line 60), `parseFrontmatter` (line 21), `serializeFrontmatter` (line 51), and types `Frontmatter` (line 3), `ParsedFrontmatter` (line 6). All used by `terminalDrain`.

- **`src/engine/queue.ts`**: exports `drainFailedTerminal` (line 176) — removes the row by id from `tbd.jsonl`.

- **`src/engine/blocked.ts`**: exports `propagateBlocked(repoRoot, failedId, log?)` (line 10) — BFS traversal stamps and moves downstream dependents.

- **`src/engine/log.ts`**: exports `Logger` type (line 4) — `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`.

- **`src/engine/issue-lifecycle.ts`**: does not exist yet. Must be created.

- **`tests/engine/issue-lifecycle.test.ts`**: does not exist yet. Must be created.

### Existing Patterns to Follow

- **File naming**: engine modules are kebab-case `.ts` in `src/engine/`. Tests mirror at `tests/engine/<name>.test.ts`.
- **Import extensions**: internal imports use `.ts` extension (e.g., `import { … } from "./frontmatter.ts"`). See `src/engine/blocked.ts:3–5`.
- **node:fs/promises usage**: all fs ops imported destructured from `"node:fs/promises"`. See `src/cli.ts:1`, `src/engine/frontmatter.ts:1`.
- **Atomic writes**: write to `.tmp` path first, then `rename`. Pattern used in `mutateFrontmatter` (`src/engine/frontmatter.ts:68–70`) and in `terminalDrain`'s fallback path (`src/cli.ts:174–176`).
- **ENOENT tolerance**: `rename` and `unlink` calls wrap ENOENT in a guard: `if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e`. See `src/cli.ts:150–154`, `178–181`.
- **Test framework**: `node:test` + `node:assert` (strict mode). No external test runner. Tests run via `node --test --experimental-strip-types`. See `package.json:25`.
- **Temp-dir pattern**: `mkdtemp(join(tmpdir(), "cycle-<slug>-"))` + `try/finally rm(root, { recursive: true, force: true })`. See `tests/engine/blocked.test.ts:35–41`, `59–71`.
- **`makeLogger()` helper**: returns `{ events: EmittedEvent[], logger }` for asserting emitted events without touching the filesystem. Used in `blocked.test.ts:11–21` and importable as a local inline helper.
- **`seedTodo()` helper**: writes a minimal `---\nid: …\n---\nbody\n` file to `docs/cycle/issues/todo/<id>.md`. See `blocked.test.ts:43–48`.
- **`setupRepo()` helper**: creates `.cycle/`, `docs/cycle/issues/todo/`, `docs/cycle/issues/failed/` directories. Pattern from `blocked.test.ts:35–41` (blocked uses `blocked/` dir instead).
- **Coverage gate**: `scripts/coverage-gate.mjs` enforces per-file floors from the `FLOORS` table (line 12). Currently only `src/engine/triage.ts` has a floor (95%). `issue-lifecycle.ts` has no floor entry yet; CLAUDE.md instructs to extend the FLOORS table to add more floors.

### Dependencies & Integration Points

- `src/engine/issue-lifecycle.ts` will import from:
  - `node:fs/promises`: `readFile`, `rename`, `writeFile`, `unlink`
  - `node:path`: `join`
  - `./frontmatter.ts`: `mutateFrontmatter`, `parseFrontmatter`, `serializeFrontmatter`, `Frontmatter`
  - `./queue.ts`: `drainFailedTerminal`
  - `./blocked.ts`: `propagateBlocked`
  - `./log.ts`: `Logger` (type)
- `src/cli.ts` currently imports all of `readFile`, `rename`, `writeFile`, `unlink` from `node:fs/promises` (line 1). After extraction, `unlink` and `writeFile` may become unused in `cli.ts` if they are not needed by remaining code — planner must verify.
- `src/cli.ts` currently imports `parseFrontmatter`, `mutateFrontmatter`, `serializeFrontmatter` (line 20) and `Frontmatter` (line 21). These are only used by `terminalDrain`; after extraction they can be removed from `cli.ts` imports — planner must verify no other usage.
- `drainFailedTerminal` import in `cli.ts` (line 15): used only inside `terminalDrain`. After extraction, `drainFailedTerminal` can be removed from the `cli.ts` import list — planner must verify.
- `propagateBlocked` import in `cli.ts` (line 22): same — used only inside `terminalDrain`.

### Test Infrastructure

- **Test framework**: Node built-in `node:test`, `node:assert` (strict). No transpile step.
- **Test conventions**: one `test()` per scenario, descriptive names like `"terminalDrain: happy path stamps frontmatter and moves file"`. Files in `tests/engine/`.
- **Mocking approach**: no mocking library. Real filesystem via `mkdtemp` temp dirs. Logger stubbed inline as object literal (`makeLogger()` pattern). External processes not involved in `terminalDrain` — all operations are pure fs + function calls.
- **Coverage of the change area**: `terminalDrain` currently lives in `cli.ts` and is tested indirectly through CLI-level tests (e.g., `tests/cli/halt.test.ts`, `tests/cli/queue-drain.test.ts`). No dedicated unit test for it. After extraction to `issue-lifecycle.ts`, unit tests will need to cover both branches (happy + fallback) to satisfy the coverage policy (≥95% line, ≥75% branch).
- **Per-file coverage floor**: `src/engine/issue-lifecycle.ts` has no floor in `scripts/coverage-gate.mjs` yet. CLAUDE.md policy says to extend FLOORS table in the same cycle.

## Code References

- `src/cli.ts:1` — fs/promises imports: `readFile, readdir, rename, writeFile, unlink, mkdir`
- `src/cli.ts:20–21` — frontmatter imports + `Frontmatter` type import
- `src/cli.ts:22` — `propagateBlocked` import
- `src/cli.ts:15` — `drainFailedTerminal` import (inside queue import block)
- `src/cli.ts:126–198` — `terminalDrain` function definition (full body to extract)
- `src/cli.ts:336` — call site 1 (resume path, commit failure)
- `src/cli.ts:346` — call site 2 (resume path, workflow failure)
- `src/cli.ts:442` — call site 3 (main loop, commit failure)
- `src/cli.ts:463` — call site 4 (main loop, workflow failure)
- `src/engine/frontmatter.ts:3` — `Frontmatter` type
- `src/engine/frontmatter.ts:21` — `parseFrontmatter`
- `src/engine/frontmatter.ts:51` — `serializeFrontmatter`
- `src/engine/frontmatter.ts:60` — `mutateFrontmatter`
- `src/engine/queue.ts:176` — `drainFailedTerminal`
- `src/engine/blocked.ts:10` — `propagateBlocked`
- `src/engine/log.ts:4` — `Logger` type
- `tests/engine/blocked.test.ts:11–21` — `makeLogger()` helper pattern to copy
- `tests/engine/blocked.test.ts:35–41` — `setupRepo()` helper pattern to adapt
- `tests/engine/blocked.test.ts:43–48` — `seedTodo()` helper pattern to adapt
- `scripts/coverage-gate.mjs:12–13` — `FLOORS` table (add `issue-lifecycle.ts` entry here)
- `package.json:25` — test runner invocation

## Open Questions

- After removing `terminalDrain` and its helper imports from `cli.ts`, do `writeFile`, `unlink`, `parseFrontmatter`, `serializeFrontmatter`, `mutateFrontmatter`, `Frontmatter`, `drainFailedTerminal`, and `propagateBlocked` remain used elsewhere in `cli.ts`? The planner must grep each symbol before pruning the import lists. (`readFile` and `rename` are definitely still used in `drainSuccess`, `drainRetry`, and other logic.)
- What per-file line coverage floor should be set for `issue-lifecycle.ts` in `scripts/coverage-gate.mjs`? CLAUDE.md instructs to add it; the SPEC is silent on the target percentage.
```
