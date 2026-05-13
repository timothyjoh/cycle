Now write RESEARCH to stdout.

# Research: Cycle 0010

## Cycle Context
SPEC asks for dedup-by-id when `scanTbd` appends to `.cycle/tbd.jsonl`. Today `src/engine/scan.ts` unconditionally appends one JSONL row per scanned `tbd/*.md` file; re-queueing the same id writes a duplicate row. Fix is local to `scanTbd`: read existing `tbd.jsonl`, build a Set of known ids, skip appendFile when id already present. File rename `tbd/ → queued/` still happens. Malformed pre-existing lines must be tolerated.

## Current Codebase State

### Relevant Components
- `scanTbd` function — moves `docs/cycle/issues/tbd/*.md` to `queued/`, parses frontmatter, appends one JSONL row per file to `.cycle/tbd.jsonl`, returns `TbdEntry[]` — `src/engine/scan.ts:17-49`
- `parseFrontmatter` helper — throws on missing frontmatter; tolerant `key: value` parse — `src/engine/scan.ts:6-15`
- `TbdEntry` type — `{ id, source, title, path, added_at }` — `src/engine/scan.ts:4`
- Single call site — `src/cli.ts:48` inside `outer: while (true)` drain loop; after `runCycle` halt-on-failure, `tbd/` and `queued/` plus `tbd.jsonl` stay as-is for next invocation (`src/cli.ts:39-69`)

### Existing Patterns to Follow
- File I/O uses `node:fs/promises` named imports (`readdir`, `rename`, `readFile`, `appendFile`, `mkdir`) — `src/engine/scan.ts:1`
- JSONL = one `JSON.stringify(obj) + "\n"` per row, append-only — `src/engine/scan.ts:45`
- Frontmatter parser already tolerates non-matching lines silently (just no key set); follow same "tolerate, skip" stance for malformed JSONL lines
- Tests use `mkdtemp(join(tmpdir(), "cycle-test-"))` + `try/finally` with `rm({recursive, force})` for cleanup — `tests/engine/scan.test.ts:9,27-28`
- Tests assert via `readFile` of `.cycle/tbd.jsonl` and `readdir` of dirs — `tests/engine/scan.test.ts:21-26`

### Dependencies & Integration Points
- Caller `src/cli.ts:48` consumes returned `TbdEntry[]` and immediately iterates to `runCycle`. SPEC allows two policies for returned array on dedup: (a) include skipped entries, (b) exclude. Caller currently feeds every returned entry into a cycle run — including a duplicate would re-run a cycle on an id already processed; excluding would silently drop a re-queued issue. PLAN must decide.
- `.cycle/tbd.jsonl` lives at `<repoRoot>/.cycle/tbd.jsonl` — directory ensured via `mkdir(cycleDir, { recursive: true })` at scan start (`src/engine/scan.ts:20-22`)
- No other reader of `tbd.jsonl` in `src/` — grep shows only the writer in `scan.ts` and a comment reference in `cli.ts:41`

### Test Infrastructure
- Framework: Node native `node:test` + `node:assert` strict — `tests/engine/scan.test.ts:1-2`
- Layout: `tests/engine/<name>.test.ts` mirrors `src/engine/<name>.ts`
- Fixtures: per-test `mkdtemp` tmpdirs, no mocks of `fs`
- Run via `npm test` (Node `--experimental-strip-types`, spec reporter) — `CLAUDE.md` Commands table
- Coverage gate: `npm run test:coverage`, must not regress line ≥ 95% / branch ≥ 75% / func ≥ 90% — `CLAUDE.md` Coverage policy
- Current coverage of `scan.ts`: one happy-path test only (`tests/engine/scan.test.ts:8-30`) — no dedup, no malformed-line, no pre-existing jsonl tests

## Code References
- `src/engine/scan.ts:17` — `scanTbd` entry; first lines compute `tbd`, `queued`, `cycleDir`
- `src/engine/scan.ts:24-29` — `readdir(tbd)` filter + early `[]` return on missing dir
- `src/engine/scan.ts:31-47` — per-file loop: read body → parseFrontmatter → rename → build entry → appendFile → push
- `src/engine/scan.ts:45` — the unconditional `appendFile` (target of fix)
- `src/cli.ts:47-69` — drain loop and halt-on-failure semantics (relevant to "what does caller do with returned dups?")
- `tests/engine/scan.test.ts:8-30` — sole existing scanTbd test; pattern to mirror

## Open Questions
- **Return-array semantics on dup id**: SPEC §Requirements explicitly defers this to PLAN — "Skipped entries still included … or — alternative — exclude them; pick whichever matches existing call-site expectations and document the choice in PLAN." Caller at `src/cli.ts:51` treats every returned entry as a cycle to run; PLAN must choose include-vs-exclude with that consequence in mind.
- **Pre-existing jsonl with duplicates already on disk**: SPEC §Out of Scope says no migration. Confirm read path must not de-dup the *existing* file content (only gate new appends).
- **`tbd.jsonl` read failure modes**: file absent (cold start) vs present-but-unreadable (permission). SPEC §Acceptance Criteria covers cold start + malformed lines; permission error behavior is unspecified.
