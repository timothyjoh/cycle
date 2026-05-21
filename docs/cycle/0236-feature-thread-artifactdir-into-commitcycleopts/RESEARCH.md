# Research: Cycle 0236

## Cycle Context

This cycle threads `artifactDir` into `CommitCycleOpts` to eliminate the fragile `readdir` prefix-scan inside `commitCycle`. Currently `commitCycle` re-discovers the cycle artifact directory by scanning `docs/cycle/` for the first entry matching `${cycleId}-*` (lines 142–149 of `commit-cycle.ts`), which silently produces an empty footprint when `docs/cycle/` does not exist and is susceptible to non-deterministic prefix collisions. The fix adds an `artifactDir?: string` field to the opts object, replaces the scan with a direct `join(opts.artifactDir, "touched.json")` read, surfaces `artifactDir` from `runCycle`'s return type, and forwards it from both `commitCycle` call sites in `cli.ts`. A regression test asserts that no spurious `commit.scope_warning` fires when `artifactDir` is supplied but `docs/cycle/` does not exist.

---

## Current Codebase State

### Relevant Components

- **`commitCycle` function**: entry point for all engine commit operations — `src/engine/commit-cycle.ts:126`
- **`CommitCycleOpts` (inline type)**: the opts object passed to `commitCycle`; currently no named type alias — it is an inline object type at `src/engine/commit-cycle.ts:128–136`. The SPEC's reference to "CommitCycleOpts" refers to this inline type.
- **`readdir` import**: `src/engine/commit-cycle.ts:3` — `import { readFile, readdir } from "node:fs/promises";`. The `readdir` identifier is used only in the directory-scan block and must be removed along with the block.
- **Directory-scan block**: `src/engine/commit-cycle.ts:141–150` — wraps `readdir(join(repoRoot, "docs/cycle"))` and `entries.find(e => e.startsWith(...))` in a try/catch. This is the entire block to be removed.
- **`touchedFiles` usage after scan**: `src/engine/commit-cycle.ts:153–171` — the scope-warning check reads `touchedFiles` (a `Set<string>` built from the scan). This block is unchanged; only the population of `touchedFiles` at lines 141–150 changes.
- **`runCycle` return shapes**: `src/engine/run-cycle.ts:419` returns `{ cycleId, status: "failed" as const, failingStep: step.name }` and `src/engine/run-cycle.ts:424` returns `{ cycleId, status: "ok" as const }`. Neither shape includes `artifactDir`. Both must be extended.
- **`artifactDir` inside `runCycle`**: computed at `src/engine/run-cycle.ts:208–229`. Populated via `prepareTrunkArtifactDir` or `checkoutCycleBranch`/`createCycleBranch`, always before the step loop begins.
- **First `commitCycle` call site** (resume path): `src/cli.ts:372–379` — inside `runResumeOnce`, called after `spawnRunOne` returns exit code 0. Has access to `tail.cycleId`, `tail.title`, and `workflowName`.
- **Second `commitCycle` call site** (fresh cycle path): `src/cli.ts:474–481` — inside the main `while (!halted)` loop, called after `spawnRunOne` returns exit code 0. Has access to `cycleId`, `row.title`, and `workflowName`.

### Critical Architectural Constraint: subprocess boundary

`cli.ts` does **not** call `runCycle` directly. Both `commitCycle` call sites are preceded by `spawnRunOne` (lines 357–365 and 460–468), which spawns a child process that runs `run-one.ts`. `run-one.ts` calls `runCycle` and exits with code 0/1 (`src/cli/run-one.ts:92`). No return value crosses the subprocess boundary — only the exit code.

Therefore, surfacing `artifactDir` from `runCycle`'s return type makes it available to `run-one.ts`, but **not** to `cli.ts`. The call sites in `cli.ts` cannot read `artifactDir` from `runCycle`'s return value.

The feasible path for `cli.ts` is **deterministic recomputation** using the same formula that all three `branch.ts` functions use:

```
join(repoRoot, "docs", "cycle", `${cycleId}-${workflow}-${slugify(title)}`)
```

All three inputs are available at both call sites:
- Resume path (`src/cli.ts:372`): `tail.cycleId`, `workflowName`, `tail.title`
- Fresh-cycle path (`src/cli.ts:474`): `cycleId`, `workflowName`, `row.title`

The `slugify` function is exported from `src/issue/id.ts:1` and is already imported into `run-cycle.ts` (`src/engine/run-cycle.ts:20`). It is **not** currently imported by `src/cli.ts`.

### `artifactDir` formula (authoritative source in `branch.ts`)

All three branch functions compute `artifactDir` identically — `src/engine/branch.ts:36`, `44`, `59`:

```typescript
const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
```

where `slug = slugify(title)` (performed by `run-cycle.ts` at line 202 via `const slug = slugify(opts.title)`).

### Existing Patterns to Follow

- **Optional opts fields with silent-skip fallback**: The `issueId?: string` and `log?: Logger` fields in `commitCycle`'s opts are optional and silently no-op when absent. `artifactDir?: string` must follow the same pattern — when absent, `touchedFiles` stays `new Set()` (empty), same as today's fallback when the scan finds nothing.
- **Real filesystem in tests, no `node:fs/promises` mocking**: CLAUDE.md explicitly documents that `node:fs/promises` cannot be stubbed via `mock.method` (ESM non-configurable properties). All existing `commit-cycle.test.ts` tests use `mkdtemp` + real filesystem operations. The new test must follow the same pattern.
- **Fake `git`/`gh` via injected `PATH`**: Tests inject a fake `PATH` via `envExtra: fakeEnv(binDir)` (`tests/engine/commit-cycle.test.ts:46–48`). Scripts in `binDir` intercept specific git subcommands and delegate others to `/usr/bin/git`.
- **`expectExactlyOne` for cardinality-pinned assertions**: `tests/helpers.ts:3–9` — asserts exactly one matching event and returns its payload. Used for `commit.scope_warning` assertions in existing tests (`commit-cycle.test.ts:495`, `559`).
- **`createLogger` with no-op sink for log capture**: Existing scope-warning tests call `createLogger(root, () => {})` to capture events without file I/O, then assert against `log.jsonl` contents after the call.

### Dependencies & Integration Points

- **`src/engine/path-utils.ts`**: `isDenied(p)` — used by the scope-warning check in `commitCycle` (line 165); unchanged by this cycle.
- **`src/engine/branch.ts`**: `prepareTrunkArtifactDir`, `checkoutCycleBranch`, `createCycleBranch` — all return `{ artifactDir }` using the same formula. Not modified by this cycle; used as the reference for the deterministic formula.
- **`src/issue/id.ts`**: `slugify` — must be added as an import to `src/cli.ts` for the deterministic `artifactDir` reconstruction at both call sites.
- **`src/engine/run-cycle.ts`**: `RunCycleOpts` type (line 187) and `runCycle` return types (lines 419, 424) — the return type must be extended to include `artifactDir: string`.
- **`src/cli/run-one.ts`**: calls `runCycle` and uses `result.status` only (line 92). `artifactDir` is now present in `result` but `run-one.ts` does not need to use it — no change required to `run-one.ts`.
- **`src/cli.ts`**: two `commitCycle` call sites (lines 372–379, 474–481); requires new `slugify` import and computation of `artifactDir`.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` with `strict` assert (`node:assert`).
- **Test file**: `tests/engine/commit-cycle.test.ts` — 566 lines, 16 `test()` blocks covering `commitCycle`, `buildClosesBlock`, `parseTouchedFiles`, and `commit.scope_warning` scenarios.
- **Helpers**: `tests/helpers.ts:3` — `expectExactlyOne(events, eventName)`.
- **Setup pattern**: `setupRepo(root)` at `commit-cycle.test.ts:30–39` — creates a temp dir with `.cycle/workflows.yml`, runs `git init --initial-branch=master`, configures user, makes an initial commit.
- **Cleanup pattern**: `finally { await rm(root, { recursive: true, force: true }); }` in every test.
- **Coverage floor**: `src/engine/commit-cycle.ts` must maintain ≥ 95% line coverage — enforced by `scripts/coverage-gate.mjs:15`.

---

## Code References

- `src/engine/commit-cycle.ts:3` — `readdir` import; must be removed
- `src/engine/commit-cycle.ts:126–136` — `commitCycle` signature with inline opts type; `artifactDir?: string` added here
- `src/engine/commit-cycle.ts:141–150` — directory-scan block; fully removed
- `src/engine/commit-cycle.ts:153–171` — scope-warning check; `touchedFiles` population source changes, check logic unchanged
- `src/engine/run-cycle.ts:202` — `const slug = slugify(opts.title)` — slug is computed here
- `src/engine/run-cycle.ts:208–229` — `artifactDir` populated from branch functions before step loop
- `src/engine/run-cycle.ts:419` — `"failed"` return shape; must add `artifactDir`
- `src/engine/run-cycle.ts:424` — `"ok"` return shape; must add `artifactDir`
- `src/cli/run-one.ts:92` — `result.status` used to determine exit code; `result.artifactDir` now available but unused here
- `src/cli.ts:372–379` — first `commitCycle` call (resume path); must add `artifactDir`
- `src/cli.ts:474–481` — second `commitCycle` call (fresh-cycle path); must add `artifactDir`
- `src/engine/branch.ts:36,44,59` — authoritative `artifactDir` formula
- `src/issue/id.ts:1` — `slugify` export
- `tests/engine/commit-cycle.test.ts:30–39` — `setupRepo` helper
- `tests/engine/commit-cycle.test.ts:41–48` — `writeFakeBin` / `fakeEnv` helpers
- `tests/engine/commit-cycle.test.ts:467–564` — existing `commit.scope_warning` tests; pattern to follow for new test
- `tests/helpers.ts:3–9` — `expectExactlyOne`
- `scripts/coverage-gate.mjs:15` — `"src/engine/commit-cycle.ts": 95` floor
- `docs/ENGINE.md:159–173` — touched.json footprint documentation; known-limitation note at line 169 is the one being retired

---

## Open Questions

1. **SPEC vs. architecture gap for `cli.ts` call sites**: The SPEC says "forward `artifactDir` from the `runCycle` result" at both `cli.ts` call sites, but `cli.ts` never calls `runCycle` directly — only `spawnRunOne` (subprocess). The planner must decide: (a) compute `artifactDir` deterministically in `cli.ts` using `join(cwd, "docs/cycle", `${cycleId}-${workflowName}-${slugify(title)}`)` — no IPC needed, but requires a `slugify` import; or (b) have `run-one.ts` write `artifactDir` to a sidecar file (e.g., `.cycle/last-artifact-dir`) readable by `cli.ts` after the subprocess exits. Option (a) is the minimal-change approach consistent with the existing formula in `branch.ts`.

2. **Named type alias vs. inline extension**: The SPEC refers to `CommitCycleOpts` as a named type, but the current code uses an inline object type in the function signature. The planner must decide whether to extract a named `CommitCycleOpts` type alias or simply add `artifactDir?: string` to the existing inline type. Extracting a named type is not required by the acceptance criteria.

3. **`runCycle` return type extension scope**: The `"failed"` return at line 419 uses `failingStep: step.name` where `step.name` is typed as `string`. Adding `artifactDir` to both return shapes is straightforward. The planner should confirm whether the `RunCycleOpts` type (line 187) or only the return type is affected.
