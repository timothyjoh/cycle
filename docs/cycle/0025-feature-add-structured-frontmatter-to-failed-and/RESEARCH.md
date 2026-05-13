```markdown
# Research: Cycle 0025

## Cycle Context

`failed-blocked-frontmatter` — stamp `last_cycle_id: <cycle_id>` into `failed/<id>.md` frontmatter at the terminal-failure move, alongside the existing `failed_at` / `failed_step` / `failed_attempts` fields. Also add a regression test that confirms `blocked_by` already carries immediate predecessors across a 2+ hop dependency graph on `propagateBlocked`. No migration of in-tree files. No new event shapes. No changes to the blocked-move path beyond test coverage.

## Current Codebase State

### Relevant Components

- Terminal-failure stamp+move call site: `src/cli.ts:120-157` (`terminalDrain`). This is where `failed_at`, `failed_step`, `failed_attempts` are written via `mutateFrontmatter` BEFORE the rename `todo/<id>.md → failed/<id>.md`, and where `drainFailedTerminal` + `propagateBlocked` are invoked. `cycle_id` is already a function parameter (`src/cli.ts:125`), so plumbing is in place — only the patch object on lines 132–137 lacks the field.
- Terminal-failure call sites (drain-row only, not the file-move): `src/engine/queue.ts:173-177` (`drainFailedTerminal`) just removes the queue row; file-move + frontmatter stamp live in `cli.ts`. Note: SPEC describes the work as happening "in `queue.ts`" — the actual stamp is in `cli.ts terminalDrain`. Planner should treat `terminalDrain` as the target site.
- Two call sites invoke `terminalDrain` with `cycleId` already in scope:
  - `src/cli.ts:288` — resume path (`runResumeOnce`); uses `tail.cycleId`.
  - `src/cli.ts:380` — fresh-pop path; uses `cycleId` from `allocateCycleId`.
- `propagateBlocked`: `src/engine/blocked.ts:10-73` — already stamps `blocked_at` (line 44) and `blocked_by: <immediate predecessors>` (line 45) via `mutateFrontmatter` before each `rename`. BFS walks `frontier` per hop so each dependent's `blocked_by` is the set of predecessors that exist in *that* frontier slice (immediate-only), not the transitive set.
- Frontmatter helpers: `src/engine/frontmatter.ts` — `parseFrontmatter` (line 21), `serializeFrontmatter` (line 51), `mutateFrontmatter` (line 60) atomic write-via-tmp-rename. `needsQuote` (line 34) quotes all-digit strings so a `"0042"` cycle id round-trips as a string, not a number; this is exactly the path `origin_cycle_id` already exercises.
- Cycle id format: `src/engine/cycle-id.ts:17` — `allocateCycleId` returns a zero-padded 4-digit string (e.g. `"0042"`). Matches the `cycle_id` field on `cycle.start` log events and the `docs/cycle/<cycle_id>-<workflow>-<slug>/` artifact directory.

### Existing Patterns to Follow

- Frontmatter mutation pattern: `await mutateFrontmatter(path, fm => ({ ...fm, key: value }))`. Conditional inclusion: `...(value ? { key: value } : {})`. See `src/cli.ts:132-137` and `src/engine/blocked.ts:42-46`.
- Test bootstrap pattern: `tests/cli/halt.test.ts:16-69` defines `bootstrapRepo` + `seedTodo` helpers that init a git repo, stage `.cycle/workflows.yml`, seed `todo/<id>.md` + `tbd.jsonl` rows, then drive the dist binary via `spawnSync("node", [dist, "run"], ...)`. The existing terminal-failure → blocked-propagation test (line 237) uses exactly this shape; the failed/A.md file is produced but its frontmatter is never asserted on. Extending that test or adding a sibling test is the natural fit for the failed-move assertion.
- Engine-level unit-test pattern: `tests/engine/blocked.test.ts:23-48` builds a fake repo with `writeQueue` + a hand-rolled `seedTodo`, then invokes the engine function directly with a fake `Logger`. `propagateBlocked` 2+ hop tests already exist at `tests/engine/blocked.test.ts:111` (transitive A→B→C) and `:135` (diamond). The "regression test" in SPEC is largely covered today; the spec asks for explicit assertion that `blocked_by` is *immediate-predecessor only*, which both existing tests already encode.
- All-digit-string round-trip pattern: `tests/engine/frontmatter.test.ts:94-99` already covers a `"0042"`-shaped value (uses `origin_cycle_id`). The same path covers `last_cycle_id` — no new helper coverage needed beyond reusing the pattern.

### Dependencies & Integration Points

- `cycle_id` reaches `terminalDrain` from two paths, both already wired:
  - Fresh pop: `cycleId = await allocateCycleId(cwd)` at `src/cli.ts:360` → passed into `terminalDrain` at line 380.
  - Resume: `tail.cycleId` (from `readLogTail`) → passed into `terminalDrain` at line 288.
- `terminalDrain` signature (`src/cli.ts:120-129`) already takes `cycleId: string` — currently only used for the `queue.drain_warning` / `queue.drained` / `issue.failed` events. The stamp call on line 132-137 simply doesn't include it in the frontmatter patch.
- RFC-001 schema already lists `last_cycle_id: "0042"` (quoted string form) at `docs/RFC-001-issue-lifecycle.md:93` — spec and RFC are aligned; only the code lags.
- CLAUDE.md architecture line for `queue.ts` (`CLAUDE.md:41`) currently enumerates `failed_at`/`failed_step`/`failed_attempts` only — SPEC requires this line be updated to include `last_cycle_id`.

### Test Infrastructure

- Test framework: Node native test runner (`node:test`, `node:assert/strict`), spec reporter, sources executed directly via `--experimental-strip-types` (Node ≥ 22.6). No transpile.
- Test layout: `tests/engine/*.test.ts` for engine modules; `tests/cli/*.test.ts` for CLI end-to-end against `dist/cycle.js`.
- CLI tests build `dist/cycle.js` via `pretest` then `spawnSync("node", [dist, "run"])` against a `mkdtemp`-ed repo, parse `.cycle/log.jsonl` events, and inspect `docs/cycle/issues/{done,failed,blocked}/`.
- Engine unit tests instantiate the function under test directly and assert via a fake `Logger` that collects `{event, fields}`.
- Coverage gate: `npm run test:coverage` runs with `--experimental-test-coverage`; baseline line ≥ 95% / branch ≥ 75% / function ≥ 90%. Current most-recent observation: 97.14 / 90.64 / 96.21.
- Current coverage of the change area:
  - `tests/cli/halt.test.ts:237` exercises a single terminal failure + `propagateBlocked` end-to-end but does not assert on `failed/A.md` body. Adding `last_cycle_id` assertions here is the cheapest path.
  - `tests/engine/blocked.test.ts:111` covers A→B→C transitive predecessor immediacy; SPEC's "blocked-move regression test" is already there. SPEC may want it duplicated/strengthened or simply called out as satisfied.
  - No existing direct-engine test for `terminalDrain` itself — it lives in `cli.ts`, not `queue.ts`. New assertion belongs at the CLI E2E layer.

## Code References

- `src/cli.ts:120-157` — `terminalDrain(cwd, log, todoPath, failedDir, cycleId, issueId, failingStep, failedAttempts)`. Lines 132-137 are the `mutateFrontmatter` call missing `last_cycle_id`. `cycleId` is already a parameter.
- `src/cli.ts:288` — resume-path call: `terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, rr.failingStep, row!.attempt + 1)`.
- `src/cli.ts:380` — fresh-pop call: `terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, r.failingStep, row.attempt + 1)`.
- `src/engine/queue.ts:173-177` — `drainFailedTerminal(repoRoot, id)`: drops the row from `tbd.jsonl`. No frontmatter or file-move side effects.
- `src/engine/blocked.ts:42-47` — `mutateFrontmatter` writes `blocked_at` + `blocked_by` then renames `todo/<id>.md → blocked/<id>.md`.
- `src/engine/frontmatter.ts:60-71` — `mutateFrontmatter` atomic patch (read → parse → patch → serialize → tmp-write → rename).
- `src/engine/frontmatter.ts:34-49` — `needsQuote` / `serializeValue`: zero-padded all-digit strings get quoted, ensuring `last_cycle_id: "0042"` survives round-trip as string.
- `src/engine/cycle-id.ts:17` — `allocateCycleId` returns `String(highest + 1).padStart(4, "0")`.
- `tests/cli/halt.test.ts:237-268` — existing E2E that fails A, drains, propagates blocked to B. Asserts `failed/` contains `A.md` (line 256) but not its body.
- `tests/engine/blocked.test.ts:111-133` — existing transitive A→B→C test asserts `blocked_by: [A]` on B and `blocked_by: [B]` on C.
- `tests/engine/frontmatter.test.ts:94-99` — existing round-trip test for zero-padded all-digit string (`origin_cycle_id: "0042"`).
- `docs/RFC-001-issue-lifecycle.md:87-95` — failed-file frontmatter schema; already lists `last_cycle_id: "0042"`.
- `CLAUDE.md:41` — queue.ts architecture line enumerating frontmatter fields stamped on terminal failure; needs `last_cycle_id` added.

## Open Questions

- SPEC text says `src/engine/queue.ts` is the writer of `last_cycle_id`, but the actual `mutateFrontmatter` call that stamps `failed_*` lives in `src/cli.ts:terminalDrain`. `queue.ts` only manipulates `tbd.jsonl`. Planner should decide whether to (a) keep the stamp in `cli.ts:terminalDrain` (smallest diff, matches existing structure) or (b) push the frontmatter stamp into a new `queue.ts` helper to match the SPEC's prose. Option (a) preserves the current separation (queue.ts = jsonl; cli.ts = file moves); option (b) consolidates per the SPEC's wording but requires moving the rename + helper directories into `queue.ts` API.
- SPEC asks for an explicit "blocked-move regression test" on a 2+ hop graph, but `tests/engine/blocked.test.ts:111` already covers A→B→C with immediate-predecessor assertions. Planner should decide whether to add a new CLI-level E2E that drives this end-to-end (mirroring `tests/cli/halt.test.ts:237`), strengthen the existing engine-level test, or treat the requirement as already met and only document it.
- The CLI `terminalDrain` already handles a `mutateFrontmatter` failure by emitting `queue.drain_warning` and still attempting the rename (`src/cli.ts:138-152`). If the new field causes a serialize failure (it shouldn't, but to confirm), the file still moves to `failed/` without the stamp — planner should confirm this fallback behavior is acceptable for `last_cycle_id` (existing fields share the same fate).
```

Research dumped to stdout for `docs/cycle/0025-feature-add-structured-frontmatter-to-failed-and/RESEARCH.md`.
