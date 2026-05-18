Enough context. Writing the research document now.

```markdown
# Research: Cycle 0152

## Cycle Context

SPEC asks for a new `cycle cleanup` one-shot subcommand (Shape A) that lists orphaned
`cycle/*` local branches — branches whose name matches `^cycle/` but for which no
`in_progress` row in `.cycle/tbd.jsonl` resolves to that exact name.  `--dry-run`
(default) prints a JSON array to stdout; `--yes` deletes each orphan and appends a
`branch.cleanup_deleted` audit event per deletion.  Safety guards: refuse on dirty
working tree (unless `--force`), refuse to delete HEAD, refuse to delete
master/configured base.  Five integration tests (a–e) are required; CLAUDE.md manual
cleanup section must be replaced with a pointer to the new subcommand.

---

## Current Codebase State

### Relevant Components

- **CLI entry / dispatch** — `src/cli.ts:41–73`  
  All subcommands are dispatched via early `if (argv[0] === "<cmd>")` blocks before
  `parseArgs` is called.  Current commands: `--version` (line 41), `init` (46), `status`
  (53), `triage` (60), `run-one` (68).  `cleanup` would be a new block after `run-one`.
  Each block does a dynamic `import("./cli/<cmd>.ts")` and calls a single exported
  function, then `process.exit(0|1)`.

- **parse-args.ts** — `src/cli/parse-args.ts`  
  Only parses `run` and `drop`; throws `unknown command` for anything else (`line 56`).
  `cleanup` must be handled *before* `parseArgs` is called (same pattern as `init`,
  `status`, `triage`) — it does NOT need to be added to `ParsedArgs`.

- **status.ts handler** — `src/cli/status.ts`  
  Simplest handler pattern: pure function `runStatus({ cwd })` returning a string.
  Called synchronously, no deps injection.  `cleanup` will be more complex (git ops +
  stdin prompt + log writes) but the module shape should match.

- **triage.ts handler** — `src/cli/triage.ts:22–47`  
  Two-tier pattern: `runCliTriageWithDeps(repoRoot, argv, deps)` for testability +
  `runCliTriage(repoRoot, argv)` thin wrapper delegating with empty deps.  `cleanup`
  should follow the same deps-injection pattern so tests can stub git calls.

- **branch.ts** — `src/engine/branch.ts`  
  Current exports: `createCycleBranch`, `checkoutCycleBranch`, `checkoutBase`,
  `pullBase`, `prepareTrunkArtifactDir`, `currentBranchName` (line 82),
  `revParseHead`, `resetCycleBranchTo`, `shaExists`, `resolveBaseBranch`.  
  **No function exists** to enumerate local `cycle/*` branches.  A new exported
  function (e.g. `listCycleBranches`) will be needed; pattern: spawn `git for-each-ref
  --format=%(refname:short)\t%(objectname:short)\t%(subject) refs/heads/cycle/` and
  parse stdout.  Existing `git()` helper (private, line 5) is the right call pattern.

- **queue.ts** — `src/engine/queue.ts:44–66`  
  `readQueue(repoRoot)` returns `QueueRow[]`.  `in_progress` rows have `cycle_id`
  set.  `QueueRow` does NOT carry `workflow` or `slug` — only `id`, `title`, `status`,
  `attempt`, `depends_on`, `triaged_at`, `cycle_id?`.

- **log.ts** — `src/engine/log.ts:8–18`  
  `createLogger(repoRoot)` returns `{ emit(event, fields) }`.  Appends to
  `.cycle/log.jsonl`.  New event shape `branch.cleanup_deleted` fits directly.

- **child-env.ts** — `src/engine/child-env.ts:16`  
  `buildChildEnv(extra)` prepends the running node's bin dir to PATH; used by all
  spawned subprocesses to guarantee correct Node version.  Any git spawns in the new
  handler should use array args + `shell: false` per subprocess discipline in CLAUDE.md.

- **id.ts / slugify** — `src/issue/id.ts:1–8`  
  `slugify(text)` lowercases, replaces non-alphanumeric runs with `-`, strips leading/
  trailing `-`, slices to 40 chars.  In `run-cycle.ts:98`, the branch slug is
  `slugify(opts.title)` where `opts.title` is the `QueueRow.title`.  So the branch
  name for any queue row is `cycle/<workflow>/<slugify(row.title)>`.

- **run-cycle.ts** — `src/engine/run-cycle.ts:98–122`  
  Branch is created as `cycle/${opts.workflow}/${slug}` where `slug = slugify(opts.title)`
  and `workflow` comes from the step runner's config (read from todo frontmatter).
  `workflow` is NOT stored in `QueueRow` — it's read from the todo `.md` file's
  frontmatter at runtime.

---

### Branch-Name Reconstruction Constraint

To determine the branch name owned by an `in_progress` row, the implementation must:
1. Read `workflow` from `docs/cycle/issues/todo/<row.id>.md` frontmatter (uses
   `parseFrontmatter` — `src/engine/frontmatter.ts`).
2. Compute `slug = slugify(row.title)`.
3. Reconstruct `cycle/<workflow>/<slug>`.

If the todo file is missing (e.g. moved to `done/` mid-run), the row cannot be
resolved — treat unresolvable rows as "live" (conservative: do not delete).

### CLAUDE.md manual cleanup section

CLAUDE.md currently has NO dedicated orphaned-branch section — the manual cleanup note
(`refl-0040-orphaned-cycle-branches-from-aborted-run-claude-md-manual-cleanup-note`) is
a *done* issue that was delivered separately.  The current CLAUDE.md `## Architecture`
section (`CLAUDE.md:53`) mentions branch.ts in the key modules list but contains no
orphan cleanup note.  The issue spec says to replace the interim manual-cleanup note
with a pointer — confirm CLAUDE.md's current state before editing.

---

### Existing Patterns to Follow

- **Subcommand module shape**: `src/cli/triage.ts` — named export `runCliCleanupWithDeps(repoRoot, argv, deps)` + `runCliCleanup(repoRoot, argv)` wrapper.
- **Early dispatch in cli.ts**: `if (argv[0] === "triage") { const { runCliTriage } = await import(...); ... process.exit(result.exitCode); }` — `src/cli.ts:60–66`.
- **Git spawn pattern**: always `spawn("git", [...], { cwd, shell: false })` — `src/engine/branch.ts:6–14`.
- **Subprocess PATH**: `buildChildEnv({})` or pass a custom `PATH` key — `src/engine/child-env.ts:16`.
- **Audit log writes**: `log.emit("branch.cleanup_deleted", { name, was_head_sha, deleted_at })` via `createLogger` — `src/engine/log.ts`.
- **Working-tree dirty check**: no existing utility; must spawn `git status --porcelain` and check stdout length > 0.
- **Frontmatter parsing**: `parseFrontmatter(body)` returns `{ fm, body }` — imported in multiple cli files.

---

### Dependencies & Integration Points

- `src/engine/branch.ts` — needs new `listCycleBranches` export (git for-each-ref)
- `src/engine/queue.ts` — `readQueue` (already exported)
- `src/engine/log.ts` — `createLogger` (already exported)
- `src/engine/frontmatter.ts` — `parseFrontmatter` (already exported)
- `src/issue/id.ts` — `slugify` (already exported)
- `src/engine/workflow.ts` — `loadConfig` for base branch name (already exported)
- `src/cli.ts` — new early dispatch block

---

### Test Infrastructure

- **Framework**: `node:test` + `node:assert/strict` — no external test runner
- **Naming/layout**: `tests/cli/<command>.test.ts` — e.g. `tests/cli/triage.test.ts`, `tests/cli/halt.test.ts`
- **Real git repos**: `mkdtemp` + `spawnSync("git", ["init", "-b", "main"])` pattern used in every integration test
- **Invocation**: `spawnSync("node", [distPath, "cleanup", ...flags], { cwd: root, env: {...} })` via `dist/cycle.js`
- **Private stub PATH**: `binDir` temp dir with a fake `claude` script on PATH — `tests/cli/triage.test.ts:47–60`
- **Repo bootstrap helper**: `bootstrapRepo(root, workflowYml, scripts)` pattern in halt.test.ts:17–42, queue-drain.test.ts:16–36
- **Seed queue rows**: `appendFile(.cycle/tbd.jsonl, JSON.stringify(row))` — queue-drain.test.ts:62–74
- **Audit log assertion**: `readFile(.cycle/log.jsonl)` then parse lines, use `expectExactlyOne` from `tests/helpers.ts`
- **Existing branch tests**: `tests/engine/branch.test.ts` — uses real git, `spawnSync` for git commands, mkdtemp fixture teardown in `finally` block

---

## Code References

- `src/cli.ts:46–72` — existing subcommand dispatch blocks (init, status, triage, run-one)
- `src/cli/parse-args.ts:56` — `throw new Error("unknown command: ...")` — cleanup must be dispatched before this line
- `src/cli/status.ts:19` — simple handler pattern `runStatus({ cwd })`
- `src/cli/triage.ts:22–47` — deps-injection handler pattern
- `src/engine/branch.ts:5–15` — private `git()` helper; `branch.ts:82–90` — `currentBranchName`
- `src/engine/queue.ts:4–15` — `QueueRow` type; `queue.ts:44–66` — `readQueue`
- `src/engine/log.ts:8–18` — `createLogger` and `Logger` type
- `src/engine/frontmatter.ts` — `parseFrontmatter`
- `src/issue/id.ts:1–8` — `slugify`; `src/engine/run-cycle.ts:98` — slug derivation site
- `tests/cli/halt.test.ts:17–42` — canonical `bootstrapRepo` + `seedTodo` helpers
- `tests/engine/branch.test.ts:1–15` — real-git test pattern with `spawnSync`

---

## Open Questions

1. **Dirty working tree detection**: no existing `isWorkingTreeDirty` utility in the
   codebase. Planner must decide: new helper in `branch.ts`, inline in `cleanup.ts`, or
   a one-liner spawn of `git status --porcelain`.

2. **`workflow` for unresolvable todo files**: if the todo `.md` has moved to `done/`
   (race: cleanup runs after a cycle completes mid-drain), the branch-name reconstruction
   fails.  Planner must decide whether to search `done/` as a fallback or treat the row
   as "claims no branch" (which would incorrectly mark the branch as orphaned).

3. **Interactive confirmation prompt under `--yes`**: The issue spec says `--yes` makes
   the command non-interactive.  Is there a `--dry-run` default + `--yes` skip-prompt
   design, or does `--yes` skip confirmation entirely?  The spec says: *"non-interactive
   when `--yes` is supplied"* — so `--yes` deletes without prompting.  Without `--yes`,
   `--dry-run` is the behavior (no deletion).  A middle case (prompt before delete with
   no flags) is not described; planner should clarify.

4. **Per-file coverage floor**: `src/cli/cleanup.ts` is a new file. Planner must decide
   whether to register it in the `FLOORS` table of `scripts/coverage-gate.mjs` and at
   what threshold (comparable files: `src/cli/run-one.ts` at 70%).
```
