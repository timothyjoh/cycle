```markdown
# Research: Cycle 0012

## Cycle Context
BB-1 renames `docs/cycle/issues/tbd/` → `raw/` and `queued/` → `todo/`, deletes empty `triaged/`, retargets `src/engine/scan.ts` (preserving the cycle-0010 `readKnownIds` dedup) to scan `raw/` and move into `todo/`, and updates every in-repo path reference (CLI, materialize, default scripts, default prompts, tests, docs). First migration step of RFC-001 bootstrap (§12 BB-1). `closes.sh` itself contains no path refs and is out of scope; `triaged/` references in scripts/tests stay only insofar as they need to be replaced by `todo/`.

## Current Codebase State

### Relevant Components

- **Scan / drain function**: `src/engine/scan.ts:38` — `scanTbd(repoRoot)` reads `docs/cycle/issues/tbd/*.md`, parses frontmatter, `rename`s file to `docs/cycle/issues/queued/`, then appends a JSONL row to `.cycle/tbd.jsonl` only when `entry.id` is not already in `knownIds` (Set built by `readKnownIds`, `src/engine/scan.ts:17-36`). Returns `TbdEntry[]` (id/source/title/path/added_at).
- **Sole caller of scan**: `src/cli.ts:4`, `src/cli.ts:48` — `scanTbd(cwd)` invoked inside the `outer: while (true)` drain loop. Comment on `src/cli.ts:33-34` still says "materialize it into tbd/ before draining. Without text, drain whatever's already in tbd/."
- **Drop / materialize**: `src/issue/materialize.ts:7` — writes file under `docs/cycle/issues/tbd/<id>.md` with frontmatter (`id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`).
- **`cycle init` scaffold**: `src/cli/init.ts:21` — creates `["tbd","queued","triaged","blocked","failed"]` under `docs/cycle/issues/`. Locates engine bundle (`locateEngineBundle`, line 26) and ships defaults dir (line 38).
- **Default commit script**: `src/defaults/scripts/commit.sh:67` — loop `for d in docs/cycle/issues/triaged docs/cycle/issues/queued; do ... fi` to locate `$CYCLE_ISSUE_ID.md` for closes-line generation. Generic `git status --porcelain` walk (line 38–55) stages any modified path that survives the denylist, so issue files under any subfolder get staged today.
- **Default PR script**: `src/defaults/scripts/pr.sh:20` — same `for d in docs/cycle/issues/triaged docs/cycle/issues/queued; do ... fi` lookup for closes block.
- **Closes helper**: `src/defaults/scripts/lib/closes.sh:9` — `closes_block <issue_file> <repo_slug>` is path-agnostic (takes the file path as arg). No folder names hardcoded.
- **Spec prompt**: `src/defaults/prompts/spec.md:12` — `2. **Issue file**: \`docs/cycle/issues/queued/<issue_id>.md\``.
- **Research prompt**: `src/defaults/prompts/research.md:23` — `3. **Issue file**: \`docs/cycle/issues/queued/<issue_id>.md\`.`
- **Engine run-cycle**: `src/engine/run-cycle.ts` — does NOT reference any of these folders directly. It receives `issueId` from the caller and emits `cycle.start`. Cycle artifacts go under `docs/cycle/<cycle_id>-...`. No change needed.

### Existing Patterns to Follow
- **Subprocess discipline**: `spawn` / `spawnSync` with array args; never `exec`; never `shell: true` (CLAUDE.md). All current `src/engine/` and `src/cli/` code conforms.
- **TS-on-the-fly**: Node ≥ 22.6 with `--experimental-strip-types`. No build step required for tests; `tsc --noEmit` enforces type cleanliness.
- **Defaults mirroring**: `npm run sync-defaults` copies `src/defaults/` → `.cycle/`. After any `src/defaults/**` edit (scripts or prompts), the dogfooded engine sees the change only after running this.
- **Frontmatter parse**: `parseFrontmatter` (`src/engine/scan.ts:6-15`) — `^---\n(.+?)\n---` regex + `(\w+):\s*(.+)` key/value split, strips surrounding double-quotes. Conventions used by every issue file.
- **Dedup pattern from cycle 0010**: `readKnownIds(jsonlPath)` (`src/engine/scan.ts:17-36`) tolerates `ENOENT`, blank lines, and malformed JSON. Membership check before `appendFile` (`src/engine/scan.ts:68`). This is the load-bearing invariant — BB-1 must preserve it after the rename.
- **Test temp-dir + cleanup**: every test creates a `mkdtemp(join(tmpdir(), "cycle-test-"))`, sets up minimal fixtures, asserts, then `rm(root, { recursive: true, force: true })` in `finally`.

### Dependencies & Integration Points
- `src/cli.ts` is the only importer of `scanTbd`. If the function is renamed, this is the single call site to update.
- `src/cli/init.ts` is only invoked from `src/cli.ts:15-17` via `await import("./cli/init.ts")` when `argv[0] === "init"`.
- `src/issue/materialize.ts` is imported by `src/cli.ts:3` (drop command) and `src/cli.ts:36` (run with positional text).
- Default scripts are shipped to consumer repos by `src/cli/init.ts:17-19` (`cp src/defaults/{workflows,prompts,scripts} → .cycle/`); they also run for the dogfooded repo's own cycles via the synced `.cycle/scripts/`.
- `.cycle/prompts/spec.md` and `.cycle/prompts/research.md` are the current synced copies in this repo and still contain the old `queued/` path — they refresh on `npm run sync-defaults`.
- The 7 in-flight `docs/cycle/issues/queued/*.md` files are visible in the working tree (untracked, per the cycle-start git status: `?? docs/cycle/issues/queued/txt-…-bb-{1..7}-…md`). They must travel to `todo/` as part of this cycle to keep the live queue intact.
- `docs/cycle/issues/raw/` already exists with 8 files (`cli-drop-writes-to-raw.md`, `depends-on-inference.md`, `engine-paused-recovery.md`, `failed-blocked-frontmatter.md`, `migration-cleanup.md`, `multi-agent-abstraction.md`, `re-triage-flag.md`, `step-restart-tolerance-audit.md`). These predate this cycle and the SPEC does not mention them.
- `docs/cycle/issues/done/` and `docs/cycle/issues/blocked/` already exist on disk; no work needed.

### Test Infrastructure
- **Framework**: Node native test runner (`node --test`), `node:assert/strict`, spec reporter. No external test framework.
- **Coverage**: `npm run test:coverage` via `--experimental-test-coverage`. Master baseline (per CLAUDE.md, 2026-05-13): line ≥ 95 %, branch ≥ 75 %, function ≥ 90 %. Both `build` and `fix` step prompts must verify no regression.
- **Layout**: `tests/<area>/<file>.test.ts` mirroring `src/<area>/<file>.ts`.
- **Existing relevant test files**:
  - `tests/engine/scan.test.ts` — 5 tests covering happy path, dedup against pre-existing row, two-scan idempotency, intra-scan dup collapse, malformed-JSONL tolerance. All currently scoped to `tbd → queued`. Helper `mkBody` and `countMatching` defined at lines 8–23.
  - `tests/cli/init.test.ts:20` — asserts `docs/cycle/issues/tbd` exists post-init.
  - `tests/issue/materialize.test.ts:12` — asserts return path ends with `/docs/cycle/issues/tbd/txt-...md`.
  - `tests/cli/multi-loop.test.ts:21-22,94-112` — comments reference `tbd/`; the test exercises `drop` + `run --dry-run` end-to-end; `drop` materializes into the current `tbd/` location, then the bundled cycle scans it.
  - `tests/defaults/commit-staging.test.ts:61-63,86-87,167-185` — fixture builds files under `docs/cycle/issues/queued/` (and the explicit `triaged/` test at L167 asserts `commit.sh` finds an issue file in `triaged/`).
  - `tests/defaults/closes-linkage.test.ts:222,257,288,394,432,458` — six setup blocks seed `docs/cycle/issues/triaged/foo.md` to exercise the closes-block lookup; both `commit.sh` and `pr.sh` paths are tested through the shim infrastructure starting at line ~200 (`installGhShim`) and ~318 (`makePrRepo`).
- **No E2E / Playwright** in this repo today; SPEC explicitly says none needed.

## Code References
- `src/engine/scan.ts:38-75` — `scanTbd` function body; rename targets and `rename(src,dst)` call.
- `src/engine/scan.ts:17-36` — `readKnownIds` dedup helper (preserve verbatim).
- `src/cli.ts:4,48,33-34` — import + call site + stale comment referencing `tbd/`.
- `src/cli/init.ts:21` — subdir list passed to `mkdir` (`["tbd","queued","triaged","blocked","failed"]`).
- `src/issue/materialize.ts:7` — `dir = join(repoRoot, "docs", "cycle", "issues", "tbd")`.
- `src/defaults/scripts/commit.sh:64-72` — `for d in docs/cycle/issues/triaged docs/cycle/issues/queued; do ... fi` issue-file lookup.
- `src/defaults/scripts/pr.sh:17-24` — same loop pattern.
- `src/defaults/prompts/spec.md:12` — `docs/cycle/issues/queued/<issue_id>.md` path doc.
- `src/defaults/prompts/research.md:23` — same.
- `tests/engine/scan.test.ts:25-149` — five tests scoped to `tbd`/`queued`.
- `tests/cli/init.test.ts:20` — `stat(join(root, "docs/cycle/issues/tbd"))`.
- `tests/issue/materialize.test.ts:12` — path assertion.
- `tests/cli/multi-loop.test.ts:21,94,110,111` — fixture comments + drop-target assertion.
- `tests/defaults/commit-staging.test.ts:61,62,73,86,87,167-185` — queued/triaged fixtures.
- `tests/defaults/closes-linkage.test.ts:222,224,257,258,288,290,394,396,432,433,458,460` — `triaged/foo.md` fixtures across commit.sh + pr.sh suites.
- `CLAUDE.md` "Architecture quick reference" — current line `Issue state machine: docs/cycle/issues/{tbd,queued,triaged,blocked,failed}/`.
- `docs/ARCHITECTURE.md:46-47,52,119,217,238-239,282-336,375,456-460,501-546,630-714,824-840` — extensive prose still describing the `tbd/queued/triaged` MVP flow.
- `BRIEF.md:145-151,264,288,307-325,421-429,456-459,504,527-538` — Brief sections describing folder layout and live queue.
- `docs/RFC-001-issue-lifecycle.md:20-35,229-265,388-406` — accepted target layout (`raw → todo → done/failed/blocked`) and bootstrap §12 BB-1 entry.
- `.cycle/prompts/spec.md`, `.cycle/prompts/research.md` — dogfooded copies of the synced defaults; they currently still say `queued/` and will be overwritten by `npm run sync-defaults` after `src/defaults/prompts/*` is edited.

## Open Questions
- `docs/cycle/issues/raw/` already contains 8 markdown files (open-questions / future-work captures from RFC-001 drafting). The SPEC says `tbd/` is empty and `queued/` files migrate to `todo/`, but is silent on the pre-existing `raw/` contents. Plan step must decide: keep them (they're already in the correct new folder), check their frontmatter conforms to the raw schema (RFC-001 §3), and confirm they should not be moved or rewritten as part of BB-1.
- `scanTbd` rename. SPEC requires locals to be renamed to `raw`/`todo` and notes "if the function is renamed, all callers update in the same cycle." Decision: keep the exported name `scanTbd` (only the JSONL is still `tbd.jsonl` per BB-3 deferring schema/file changes), or rename to something neutral (`scanRaw` / `drainRaw`)? Both are mechanically simple; the plan step picks one and updates the lone caller in `src/cli.ts`.
- `tests/defaults/commit-staging.test.ts:167-185` "triaged issue file is staged just like queued" — under RFC-001 there is no `triaged/` anymore. SPEC says rename to reflect the new lifecycle (`todo/` case) or delete if it duplicates the existing `todo/` case. Plan step picks: rewrite into a `todo/` assertion or delete entirely.
- `tests/defaults/closes-linkage.test.ts` uses `triaged/` in 6 places. Under RFC-001 the lookup folder becomes `todo/`. Plan step decides whether to migrate all six fixtures to `todo/` or split coverage between `todo/` and (future) `done/` lookup once BB-3 lands. SPEC's lookup-loop scope is just `todo/` for now.
- ARCHITECTURE.md and BRIEF.md prose updates: SPEC says "ARCHITECTURE.md should defer to RFC-001 instead of restating." How aggressively to strip vs. cross-reference is a judgment call for the plan step — the diff could be small (replace folder names in place) or large (replace whole sections with a pointer to RFC-001).
- The engine is currently mid-run for cycle 0012 inside this branch's worktree. The SPEC flags that the live engine's working tree must not be modified out-of-band during build; the plan step needs to confirm whether the rename of `docs/cycle/issues/queued/` (which holds the 7 in-flight bb-* files) is safe to do while the engine is reading from it, or if it must be staged differently (e.g., do the file move as part of the same commit that updates `scan.ts`).
- `.claude/skills/cycle.md` — SPEC mentions updating "if present." Existence in this repo is not yet confirmed; plan step should glob and treat as no-op if absent.
```
