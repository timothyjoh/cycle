```markdown
# Research: Cycle 0028

## Cycle Context
SPEC.md asks to delete `.cycle/tbd.jsonl.bootstrap-archive` (after guarding that `docs/cycle/issues/{tbd,queued,triaged}/` are absent), inline-annotate the four remaining unannotated deprecated-folder mentions in `docs/RFC-001-issue-lifecycle.md` / `docs/DOGFOOD.md` / `docs/plans/2026-05-12-cycle-mvp-dogfood.md`, and verify the bootstrap-archive code path in `src/engine/queue.ts` plus its four subtests remain green. **No source code changes.** Bootstrap-archive *detection* must keep working for legacy repos.

> **Cycle 0028 is the second retry of cycle 0026.** Cycle 0026 failed at `commit` (exit 128, `.cycle/log.jsonl:649-650`); cycle 0027 also failed at `commit` (exit 128, `.cycle/log.jsonl:671-672`); cycle 0028 inherits the same dirty working tree. Every SPEC-intended mutation already exists uncommitted in the working tree. A planner for this cycle must (a) diagnose the still-undiagnosed `commit` failure mode and (b) decide what the build pass does given an already-clean acceptance state, rather than re-applying the documented edits.

## Current Codebase State

### Pre-existing in-flight state (inherited from cycles 0026 + 0027, uncommitted)
- `git status --short` (verified at research time):
  - `D  .cycle/tbd.jsonl.bootstrap-archive` — staged-deletion of the dogfood artifact (5 legacy `{id, source: "text", title, path, added_at}` rows).
  - ` M docs/DOGFOOD.md` — inline historical marker added (verified `docs/DOGFOOD.md:28-31`, `+3 / -1`).
  - ` M docs/RFC-001-issue-lifecycle.md` — three `(superseded — see § 12 BB-1)` annotations applied at lines 10, 390, 416 (`+3 / -3`, verified via `git diff`).
  - ` M docs/plans/2026-05-12-cycle-mvp-dogfood.md` — top-of-file historical banner prepended at line 3 (`+2 / -0`).
  - `?? docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/` — full 7-file artifact dir from cycle 0027 (SPEC, RESEARCH, PLAN, BUILD, REVIEW, MUST-FIX, FIX).
  - `?? docs/cycle/0028-feature-cleanup-remove-deprecated-tbd-queued-tri/SPEC.md` — this cycle's own artifact dir.
- Branch `cycle/feature/cleanup-remove-deprecated-tbd-queued-tri` still points at master HEAD `b6662c3` (`cycle 0025: Add structured frontmatter to failed/ and blocked/ file moves (#35)`) — no 0026/0027/0028 commits.
- `git stash list` shows one entry: `stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine`. `git stash show stash@{0} --stat` reports **2 files / 49 deletions**:
  - `.cycle/tbd.jsonl.bootstrap-archive | 5 ---`
  - `docs/cycle/issues/todo/failed-blocked-frontmatter.md | 44 ---`
  Cycle 0027's BUILD.md narrative described stashing "~10 paths" of cycle-0025 debris; the realized stash contains only these 2. Bucket implications: the bootstrap-archive deletion is duplicated between the working tree (`D` staged) and the stash; popping the stash would no-op on a file already deleted, but the `failed-blocked-frontmatter.md` deletion would re-emerge in the working tree.
- `docs/cycle/issues/` contains exactly `{blocked, done, failed, raw, todo}/`. `tbd/`, `queued/`, `triaged/` absent (BB-1 / cycle 0012 removed them). `raw/`, `blocked/`, `failed/` are empty.

### Relevant Components
- **Bootstrap archive code path** (must remain functional, no source edits) — `src/engine/queue.ts`:
  - `queuePath` (`src/engine/queue.ts:17-19`) → `.cycle/tbd.jsonl`.
  - `isLegacyLine` (`src/engine/queue.ts:25-30`) — shape predicate: `status === undefined` on a `{id: string}` row.
  - `pickArchivePath` (`src/engine/queue.ts:82-98`) — selects `.cycle/tbd.jsonl.bootstrap-archive`, falls back to `.bootstrap-archive.{1..999}` on collision.
  - `bootstrapArchiveIfLegacy` (`src/engine/queue.ts:100-127`) — reads `.cycle/tbd.jsonl`, scans every line via `isLegacyLine`, `rename`s file to archive path if any legacy line is found. Returns `false` when file is absent or schema is already current. Never reads the archive file after writing it — deletion of this repo's archive does not regress behavior.
- **Issue-path constants (canonical live set, no deprecated names)** — `src/cli.ts:81-84` (`todoDir, doneDir, failedDir, rawDir`), `src/engine/blocked.ts:15-16` (`todoDir, blockedDir`), `src/engine/reflection.ts:19` (`rawDir`), `src/engine/triage.ts:171,267,332,569,570,658` (references `raw/`, `todo/`, `done/`, `failed/` only).
- **`commit.sh` (likely failure surface)** — `.cycle/scripts/commit.sh` (full script, 79 lines):
  - `set -euo pipefail` (line 7).
  - Iterates `git status --porcelain --untracked-files=all` (line 51), staging each path unless it matches a denylist (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) or is a submodule gitlink (`160000` mode or `<path>/.git` present).
  - Renames `R*|C*` lines to take the destination path (`${path##* -> }`).
  - `git add -- "$path"` per non-denied path.
  - Short-circuits with `exit 0` if `git diff --cached --quiet` after staging.
  - Sources `.cycle/scripts/lib/closes.sh` to scan `docs/cycle/issues/todo/${CYCLE_ISSUE_ID}.md` for `https://github.com/<repo_slug>/issues/<N>` URLs, emitting `Closes #N` lines.
  - `git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}"` (with the closes block as a second `-m` if non-empty), then `git rev-parse HEAD`.
- **`exec-bash.ts`** — `src/engine/exec-bash.ts:12-32` (`execBashStep`) captures stderr but **does not emit it to `log.jsonl`**; `step.end` carries only `{status, exit_code}` (`src/engine/run-cycle.ts:80`). Consequence: the stderr from both prior commit-step exit-128 failures was discarded.
- **Engine env to commit step** — `src/engine/run-cycle.ts:54-57` populates `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, and `CYCLE_ISSUE_ID`. All four are referenced by `commit.sh`.
- **`.gitignore`** — `.gitignore:5-7` ignores `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, `.cycle/cycle.pid`. **Not ignored: `.cycle/tbd.jsonl.bootstrap-archive`** — confirming the file is tracked and a `D` is the correct status before commit.
- **No git hooks installed** — `.git/hooks/` is empty of non-sample hooks (`ls -la .git/hooks/`). `package.json` has no `husky` / `pre-commit` config. The commit failure is not hook-induced.
- **Repo origin** — `git@github.com:timothyjoh/cycle.git`. `commit.sh` resolves `repo_slug` via `gh repo view --json nameWithOwner -q .nameWithOwner` (line 75); `closes_block` matches GitHub issue URLs only when `owner/repo` matches that slug.

### Existing Patterns to Follow
- **Stderr-capture pattern** — `src/engine/exec-bash.ts:23` already stores `stderr` on `StepResult`. Emitting it on `step.end` for failed bash steps is a one-line edit at `src/engine/run-cycle.ts:80`. This is the only path that surfaces commit/verify/pr failure detail.
- **Restart tolerance pattern (existing)** — `pr.sh` reuses `gh pr list --head` to detect an existing PR and avoid re-creating (per `CLAUDE.md` "Resume from log tail"). `commit.sh`'s "idempotent by design" claim (per `docs/RFC-001-issue-lifecycle.md:381`) hinges on `git diff --cached --quiet` short-circuiting once the cycle has already been committed — which is true on the *success path*, but irrelevant to the failed-path scenario this cycle is stuck in.
- **Bucketed acceptance grep** — established in cycle 0012 (`docs/cycle/0012-…/PLAN.md:294`), refined across cycles 0026/0027 into a four-bucket scheme: (a) RFC-001 inline-annotated, (b) DOGFOOD + MVP plan annotated, (c) immutable cycle-artifact dirs (`docs/cycle/<id>-…/`), (d) immutable issue records under `docs/cycle/issues/{done,todo}/*.md`. Every match falls into exactly one bucket.
- **Annotation convention** — `(superseded — see § 12 BB-1)` for RFC-001 inline parentheticals; single-line `> **Historical plan (pre-RFC-001).** …` banner for plan/dogfood docs.

### Dependencies & Integration Points
- **`src/engine/queue.ts`** — owns the bootstrap-archive read/write contract; only entry point that touches `.cycle/tbd.jsonl.bootstrap-archive`. Deleting this repo's archive is a no-op for the function (triggers only when a *legacy* `.cycle/tbd.jsonl` is present, which this repo's drain has long since drained empty).
- **`tests/engine/queue.test.ts:88-154`** — four subtests cover the bootstrap-archive contract:
  - `bootstrapArchiveIfLegacy: archives legacy file once` (95-114) — seeds legacy row, asserts archive written + queue file removed.
  - `bootstrapArchiveIfLegacy: idempotent on new-shape file` (116-127).
  - `bootstrapArchiveIfLegacy: no-op on missing file` (129-137) — exercises the post-deletion path SPEC most cares about.
  - `bootstrapArchiveIfLegacy: numeric suffix on collision` (139-154).
  All four use `mkdtemp` ephemeral roots; zero dependency on the repo's actual archive. Cycle 0027's gate (`BUILD.md`) confirms they pass.
- **`CLAUDE.md`** — Architecture quick reference enumerates only `{raw, todo, done, blocked, failed}/` (verified at line 39). Bootstrap-archive description at line 41 remains accurate after dogfood-artifact deletion (it describes the mechanism, not the file's presence in this repo).
- **`README.md`** — references `tbd.jsonl` (queue file) only, no deprecated folder mentions.
- **`.cycle/` (dogfooded copy of `src/defaults/`)** — no deprecated-folder path references in `.cycle/scripts/`, `.cycle/prompts/`, or `.cycle/workflows.yml`. No `src/defaults/` edits expected, so `npm run sync-defaults` not required.

### Why the prior two cycles failed at `commit` (informational, undiagnosed)
- `.cycle/log.jsonl:649-650` (cycle 0026) and `.cycle/log.jsonl:671-672` (cycle 0027) both record `step.end status:"failed" exit_code:128 step:"commit"` with **no stderr captured**. Engine's `step.end` payload omits stderr by design (`src/engine/run-cycle.ts:80`).
- Cycle 0027's BUILD reported the post-stash working tree contained exactly the four SPEC paths plus the artifact dir — same shape as cycle 0028 inherits today, minus the cycle 0028 SPEC.md.
- `commit.sh`'s `set -euo pipefail` makes any single git failure abort with the originating git's exit code. Exit 128 is git's generic "fatal" code (covers paths like: file not found by `git add`, ref ambiguity in `git reset HEAD --`, branch divergence in `git commit`, missing repo for `gh` invocation, …). Without stderr, the proximate cause cannot be inferred from the log alone.
- Concrete diagnostic surface available to the planner: (i) run `bash -x .cycle/scripts/commit.sh` against the current dirty tree manually to capture trace + stderr; (ii) temporarily emit `stderr` on `step.end` in `src/engine/run-cycle.ts:80` and rerun; (iii) inspect the engine's transcript for the failing cycle if the agent harness preserved it. Root-cause analysis is **out of scope for research** per the documentarian rule.

### Test Infrastructure
- Test framework: Node native `node:test`, invoked via `npm test` (auto-builds `dist/cycle.js` via `pretest`).
- Test conventions: tests live in `tests/<area>/<file>.test.ts`. Engine tests under `tests/engine/`. Use `node:test`, `node:assert/strict`, ephemeral filesystems via `mkdtemp(join(tmpdir(), "cycle-…-"))`, cleanup with `rm(root, { recursive: true, force: true })` in `try/finally`.
- Coverage gate per `CLAUDE.md`: line ≥ 95%, branch ≥ 75%, function ≥ 90%; current baseline 97.14 / 90.64 / 96.21.
- Current change-area coverage (per cycle 0027 BUILD.md): `src/engine/queue.ts` 96.05% line / 86.90% branch / 100% function. Unchanged from cycle 0026 (no source edits in either retry).

## Code References
- `src/engine/queue.ts:17-19` — `queuePath(repoRoot)` → `.cycle/tbd.jsonl`.
- `src/engine/queue.ts:25-30` — `isLegacyLine`: shape predicate.
- `src/engine/queue.ts:82-98` — `pickArchivePath`: archive filename with numeric-suffix fallback.
- `src/engine/queue.ts:100-127` — `bootstrapArchiveIfLegacy`: the legacy-detect-and-rename path SPEC requires preserved.
- `src/cli.ts:81-84` — canonical issue-folder constants.
- `src/engine/blocked.ts:15-16`, `src/engine/reflection.ts:19`, `src/engine/triage.ts:171,267,332,569,570,658` — engine writers reference only the canonical live folders.
- `src/engine/exec-bash.ts:12-32` — `execBashStep`; captures stderr on `StepResult` but caller drops it.
- `src/engine/run-cycle.ts:54-57` — `CYCLE_*` env populated for bash steps.
- `src/engine/run-cycle.ts:80` — `step.end` emission; the spot where stderr could be surfaced.
- `.cycle/scripts/commit.sh:1-79` — full commit pipeline (set -euo pipefail, denylist, gitlink filter, per-path stage, closes-block, `git commit`).
- `.cycle/scripts/lib/closes.sh` — GitHub URL → `Closes #N` mapping; no-op when issue file or repo_slug missing.
- `.gitignore:5-7` — `.cycle/tbd.jsonl.bootstrap-archive` is **not** ignored (file is tracked).
- `tests/engine/queue.test.ts:88-154` — four bootstrap-archive subtests covering both `isLegacyLine` branches and both archive-path outcomes.
- `tests/engine/queue.test.ts:33` — `triaged_at` in the `row()` factory; queue-row field, **not** a folder reference (out of scope per SPEC).
- `CLAUDE.md:39` — Architecture quick reference enumerates only the five live folders.
- `CLAUDE.md:41` — bootstrap-archive description; remains accurate post-deletion.
- `docs/RFC-001-issue-lifecycle.md:10,390,416` — already-applied `(superseded — see § 12 BB-1)` annotations (uncommitted; `git diff` confirms).
- `docs/RFC-001-issue-lifecycle.md:35,425-426` — earlier already-historical mentions; left intact.
- `docs/RFC-001-issue-lifecycle.md:381` — declares `commit.sh: idempotent by design` (the assumption that breaks under the prior cycles' exit-128 fault).
- `docs/RFC-001-issue-lifecycle.md:419` — "Step-level restart tolerance audit" follow-up tracked as open future work.
- `docs/DOGFOOD.md:28-31` — already-applied inline historical marker (uncommitted).
- `docs/plans/2026-05-12-cycle-mvp-dogfood.md:3` — already-applied top-of-file historical banner (uncommitted).
- `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md:22-30,48` — cycle 0027's bucketed acceptance-grep table; counts re-aligned in FIX.md to Σ=63 against the live `wc -l`.
- `.cycle/log.jsonl:647-651` — cycle 0026 verify→commit→cycle.end→checkout sequence with exit 128.
- `.cycle/log.jsonl:670-674` — cycle 0027 same sequence with exit 128.

## Acceptance-grep status (verified live at research time)
- `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → **0 hits**.
- `rg -n '(^|/)(tbd|queued|triaged)/' docs/` → **~70 hits** projected (cycle 0027's 63-hit baseline + the 7 new cycle-0027 artifact files now committed-into-tree-as-untracked + the cycle-0028 SPEC.md). Live re-run during build will produce the exact count. All hits remain categorisable under the four-bucket scheme; the new additions land in bucket c (cycle-0027 artifact dir) and bucket c (cycle-0028 SPEC.md).
- Bucket a remains 0 (RFC-001 annotations sit on backtick-wrapped folder names; the regex's `(^|/)` boundary doesn't match a backtick prefix — see cycle 0027 REVIEW Finding 3).

## Open Questions
- **What did `commit.sh` actually fail on?** Two retries, same exit code, no stderr in `log.jsonl`. The planner must propose a concrete diagnostic path before re-attempting `commit`: (i) instrument `src/engine/run-cycle.ts:80` to emit stderr on failed bash steps, (ii) reproduce manually with `CYCLE_ID=0028 CYCLE_TITLE='…' CYCLE_ISSUE_ID=migration-cleanup bash -x .cycle/scripts/commit.sh`, or (iii) audit `commit.sh` for resume-safety analogous to `pr.sh`'s `gh pr list --head` reuse. Without diagnosis the third retry has the same shape and the same expected failure mode.
- **Should cycle 0028's build step re-pop `stash@{0}`?** The stash contains `failed-blocked-frontmatter.md` deletion (cycle-0025 dogfood debris that already shipped via cycle 0025's commit to `done/`, but the `todo/` copy was never cleaned up) and a duplicate of the bootstrap-archive deletion. Popping would re-stage the failed-blocked-frontmatter deletion into this cycle's commit (out of SPEC scope). Leaving the stash dormant risks reflog expiry. Planner must choose.
- **Does the build pass do work, or only verify?** SPEC's six tasks (delete archive, annotate three docs, verify code path, run gates) are all already in the working tree. RFC-001's open `Step-level restart tolerance audit` (`docs/RFC-001-issue-lifecycle.md:419`) is the relevant precedent for "what does build do on a retry where all mutations are pre-applied?"
- **Out-of-scope `BRIEF.md` references.** `BRIEF.md` (repo root, outside `docs/`) contains ~9 deprecated-folder mentions (lines 145, 310-311, 421, 456-457, 504, 527-528, 536, 538). SPEC's sweep paths exclude it. Carried forward from cycle 0027 RESEARCH; explicit decision deferred to planner.
- **Cycle-0027 artifact dir disposition.** `docs/cycle/0027-…/` is the full history of the failed cycle's spec→fix sequence. Including it in cycle 0028's commit (the default `commit.sh` behavior — every untracked file gets staged) preserves the audit trail per BB-1 convention. Excluding it would lose history. Planner should confirm the default behavior is correct here and that the artifact dir does not need to be moved/renamed.
- **`commit.sh` stage-everything semantics under cycle 0028's working tree.** The script's path-loop will attempt to stage: 4 modified/deleted SPEC paths, 7 untracked files under `docs/cycle/0027-…/`, and 1+ files under `docs/cycle/0028-…/`. None match the denylist. Planner should confirm whether this is the intended commit surface for this cycle or whether the cycle-0028 artifact dir should be excluded (it is normally added by the engine's later steps, post-commit).
