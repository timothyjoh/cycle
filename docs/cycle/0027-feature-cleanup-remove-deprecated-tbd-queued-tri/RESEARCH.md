```markdown
# Research: Cycle 0027

## Cycle Context
SPEC asks to strip the repo of vestigial pre-RFC-001 lifecycle state: delete `.cycle/tbd.jsonl.bootstrap-archive`, confirm the deprecated `docs/cycle/issues/{tbd,queued,triaged}/` folders are absent, and annotate every remaining live-path reference to those folder names in `src/`, `tests/`, `src/defaults/`, and `docs/` as historical / superseded. The bootstrap-archive *detection* code path in `src/engine/queue.ts` must keep working for future legacy detection on other repos; only this repo's already-inspected artifact is deleted. The canonical live folder set is `raw/`, `todo/`, `done/`, `blocked/`, `failed/`.

> **Cycle 0027 is a retry of cycle 0026.** Cycle 0026 ran spec → research → plan → build → review → fix → verify successfully, then failed at the `commit` step with `exit_code: 128` (`.cycle/log.jsonl` 2026-05-13T20:36:21.171Z). The queue drained with `outcome: "retry"` and cycle 0027 started on the same `migration-cleanup` issue, reusing branch `cycle/feature/cleanup-remove-deprecated-tbd-queued-tri`. As a result, *all of the SPEC's intended mutations already exist as uncommitted working-tree changes* — see "Pre-existing in-flight state" below. Any planner for this cycle must reconcile with that state instead of re-doing it.

## Current Codebase State

### Pre-existing in-flight state (from cycle 0026's build/fix steps, uncommitted)
- `git status --short` (current):
  - `D  .cycle/tbd.jsonl.bootstrap-archive` — the dogfood artifact has already been `git rm`'d.
  - ` M docs/DOGFOOD.md` — inline historical marker added at line 28 (see diff below).
  - ` M docs/RFC-001-issue-lifecycle.md` — three `(superseded — see § 12 BB-1)` parenthetical annotations applied (lines 10, 390, 416 per cycle 0026 BUILD.md; the diff shows lines 10, 390, 416).
  - ` M docs/plans/2026-05-12-cycle-mvp-dogfood.md` — top-of-file historical banner prepended.
- Branch `cycle/feature/cleanup-remove-deprecated-tbd-queued-tri` still points at master HEAD `b6662c3` — none of the above is committed.
- Confirmed unchanged on disk: `docs/cycle/issues/` contains exactly `raw/ todo/ done/ blocked/ failed/`. Deprecated folders `tbd/`, `queued/`, `triaged/` are absent (BB-1 / cycle 0012 removed them).
- Out-of-scope debris in the working tree: untracked `REFLECTION.md` + `refl-0025-*` raw/todo issue files left over from cycle 0025; the failed-blocked-frontmatter issue file was moved `todo/ → done/` mid-cycle. None of these impact the SPEC's acceptance criteria but they do affect what gets staged.

### Relevant Components
- **Issue lifecycle folders on disk** — only the canonical set is present (`docs/cycle/issues/{raw,todo,done,blocked,failed}/`). The deprecated `tbd/`, `queued/`, `triaged/` directories have been absent from the working tree since BB-1 (cycle 0012).
- **Bootstrap archive artifact** — `.cycle/tbd.jsonl.bootstrap-archive` is already deleted in the working tree (staged `D`). Pre-deletion it held 5 lines of legacy `{id, source: "text", title, path, added_at}` rows from the pre-BB-3 schema.
- **Bootstrap archive code path** — `src/engine/queue.ts:82-127`:
  - `pickArchivePath(repoRoot)` (`src/engine/queue.ts:82-98`) — picks `.cycle/tbd.jsonl.bootstrap-archive`, falls back to `.bootstrap-archive.{1..999}` on collision.
  - `bootstrapArchiveIfLegacy(repoRoot)` (`src/engine/queue.ts:100-127`) — reads `.cycle/tbd.jsonl`, scans every JSON line via `isLegacyLine` (`src/engine/queue.ts:25-30`), and `rename`s the file to the archive path if any legacy line is found. Returns `false` (no-op) when file is absent or schema is already current. Does **not** read the archive file after writing it — deletion of this repo's archive does not regress behavior.
- **Issue-path constants** — `src/cli.ts:81-84` declares `todoDir`, `doneDir`, `failedDir`, `rawDir`. `src/engine/blocked.ts:15-16` declares `todoDir`, `blockedDir`. `src/engine/reflection.ts:19` declares `rawDir`. `src/engine/triage.ts:171,267,332,569,570,658` references `raw/`, `todo/`, `done/`, `failed/`. **No engine code references `tbd/`, `queued/`, or `triaged/` as folder paths.**

### Existing Patterns to Follow
- **Atomic queue-file mutation**: `writeQueue` (`src/engine/queue.ts:68-75`) writes to `.tmp` then `rename`s. `bootstrapArchiveIfLegacy`'s rename (line 125) follows the same single-syscall move pattern.
- **No-op on absent file**: `bootstrapArchiveIfLegacy` returns `false` cleanly when `.cycle/tbd.jsonl` is missing (`src/engine/queue.ts:103-108`); same shape in `readQueue` (`src/engine/queue.ts:49-51`). Both already tested.
- **Documentation annotation convention** — cycle 0026 picked `(superseded — see § 12 BB-1)` inline parentheticals for RFC-001 narrative and a single-line top banner for the MVP plan doc. The banner format used: `> **Historical plan (pre-RFC-001).** References to … See `docs/RFC-001-issue-lifecycle.md` § 12 BB-1 for the rename.` (See `docs/plans/2026-05-12-cycle-mvp-dogfood.md:3` in current working tree.)
- **Acceptance-grep bucketing** — `BB-1`'s plan (`docs/cycle/0012-feature-bb-1-…/PLAN.md:294`) established that the deprecated-folder cleanup grep excludes immutable `docs/cycle/<cycle_id>-…/` artifact dirs. Cycle 0026's BUILD.md table extends this to a four-bucket scheme: (a) RFC-001 annotated, (b) DOGFOOD/MVP-plan annotated, (c) immutable cycle artifact, (d) immutable issue record under `docs/cycle/issues/{raw,todo,done,blocked,failed}/*.md`.

### Dependencies & Integration Points
- **`src/engine/queue.ts`** — owns the bootstrap-archive read/write contract. `bootstrapArchiveIfLegacy` is the only entry point that touches `.cycle/tbd.jsonl.bootstrap-archive`. Deleting this repo's archive file does not affect the function's behavior — it triggers only when a *legacy* `.cycle/tbd.jsonl` is present.
- **`tests/engine/queue.test.ts`** — four subtests exercise the bootstrap-archive path (`tests/engine/queue.test.ts:88-154`):
  - `bootstrapArchiveIfLegacy: archives legacy file once` (95-114) — seeds legacy row, asserts archive written and queue file moved.
  - `bootstrapArchiveIfLegacy: idempotent on new-shape file` (116-127) — seeds new-shape row, asserts no archive created.
  - `bootstrapArchiveIfLegacy: no-op on missing file` (129-137) — asserts return `false` when `.cycle/tbd.jsonl` absent.
  - `bootstrapArchiveIfLegacy: numeric suffix on collision` (139-154) — seeds twice, asserts `.bootstrap-archive` and `.bootstrap-archive.1` both exist.
  All four use ephemeral `mkdtemp` roots, never depend on the repo's actual `.cycle/tbd.jsonl.bootstrap-archive`. Cycle 0026 reran them post-deletion and they passed (BUILD.md Task 5).
- **`CLAUDE.md`** — Architecture quick reference already enumerates `{raw,todo,done,blocked,failed}/` correctly (line 39). Mentions of `tbd.jsonl` (queue file, not folder) and `.cycle/tbd.jsonl.bootstrap-archive` (bootstrap mechanism description, line 41) are accurate and remain correct after the artifact deletion.
- **`README.md`** — references `tbd.jsonl` (queue file) only; no live mentions of the deprecated `tbd/`/`queued/`/`triaged/` folders.
- **`.cycle/` (dogfooded copy of `src/defaults/`)** — `.cycle/scripts/`, `.cycle/prompts/`, and `.cycle/workflows.yml` mirror `src/defaults/`. No deprecated-folder path references in either source or mirror. Any change under `src/defaults/` requires `npm run sync-defaults`.

### Why cycle 0026's commit step failed (informational)
- `.cycle/log.jsonl` shows `step.end status:"failed" exit_code:128` on `commit`. `cycle.checkout` immediately after returned `head_before: cycle/feature/cleanup-remove-deprecated-tbd-queued-tri` — i.e., the branch already existed at the failure moment, suggesting the commit script tried to create a branch already present or hit a `pre-commit` hook divergence. The branch is still at `b6662c3` (master HEAD) with no 0026 commits. Concrete root-cause analysis is **out of scope for research** per the documentarian rule — flagging only so the planner knows the prior cycle's mutations need a fresh commit attempt, not a re-do.

### Test Infrastructure
- **Test framework**: Node's native `node:test`, invoked via `npm test` (auto-builds `dist/cycle.js` via `pretest`).
- **Test conventions**: tests live in `tests/<area>/<file>.test.ts`. Engine tests under `tests/engine/`. Use `node:test`, `node:assert/strict`, ephemeral filesystems via `mkdtemp(join(tmpdir(), "cycle-…-"))`. Cleanup with `rm(root, { recursive: true, force: true })` in `try/finally`.
- **Coverage gate**: line ≥ 95%, branch ≥ 75%, function ≥ 90% (per `CLAUDE.md` "Coverage policy"). Reported in `BUILD.md` / `FIX.md`.
- **Last measured coverage of change area** — cycle 0026 reported 97.14% line / 90.64% branch / 96.21% function overall, with `src/engine/queue.ts` at 96.05% line / 86.90% branch / 100% function after the artifact deletion (no code change required).

## Code References
- `src/engine/queue.ts:17-19` — `queuePath(repoRoot)` → `.cycle/tbd.jsonl`.
- `src/engine/queue.ts:25-30` — `isLegacyLine`: shape predicate (`status === undefined` on a `{id: string}` row).
- `src/engine/queue.ts:82-98` — `pickArchivePath`: archive filename selector with numeric suffix on collision.
- `src/engine/queue.ts:100-127` — `bootstrapArchiveIfLegacy`: the legacy-detect-and-rename path SPEC requires to keep working.
- `src/cli.ts:81-84` — canonical issue-folder constants; no deprecated names.
- `src/engine/blocked.ts:15-16`, `src/engine/reflection.ts:19`, `src/engine/triage.ts:171,267,332,569,570,658` — engine writers reference only `raw/`, `todo/`, `done/`, `blocked/`, `failed/`.
- `tests/engine/queue.test.ts:88-154` — four bootstrap-archive subtests covering both branches of `isLegacyLine` and all archive-path outcomes.
- `tests/engine/queue.test.ts:33` — `triaged_at` in the `row()` factory; queue-row field, **not** a folder reference (out of scope per SPEC).
- `CLAUDE.md:39` — Architecture quick reference lists `{raw,todo,done,blocked,failed}/`.
- `CLAUDE.md:41` — bootstrap-archive description: `"First start with a legacy tbd.jsonl archives it to .cycle/tbd.jsonl.bootstrap-archive once"` — remains accurate after dogfood-artifact deletion.
- `docs/RFC-001-issue-lifecycle.md:10,390,416` — already-applied `(superseded — see § 12 BB-1)` annotations (uncommitted; see `git diff`).
- `docs/RFC-001-issue-lifecycle.md:35,425-426` — historical mentions that already explicitly mark the deprecated folders as removed; left intact.
- `docs/DOGFOOD.md:28-31` — already-applied inline historical marker (uncommitted).
- `docs/plans/2026-05-12-cycle-mvp-dogfood.md:3` — already-applied top-of-file historical banner (uncommitted).
- `docs/cycle/0026-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md` — cycle 0026's complete bucketed acceptance-grep table covering all 67 surviving `docs/` hits across (b), (c), (d).

## Acceptance-grep status (verified live)
- `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` → **0 hits**.
- `rg -n '(^|/)(tbd|queued|triaged)/' docs/` → **67 hits**, fully categorized in cycle 0026's BUILD.md as: 2 hits annotated-historical (DOGFOOD.md + MVP plan, bucket b), ~57 hits in immutable cycle-artifact dirs (bucket c), ~8 hits in immutable issue records under `docs/cycle/issues/{done,todo}/*.md` (bucket d). Zero unassigned.

## Open Questions
- **What did `commit.sh` actually fail on at cycle 0026?** Exit 128 is a generic git failure. The planner needs to decide whether to (a) trust the working-tree mutations as-is and rely on `commit.sh` to re-run cleanly this pass, (b) audit `commit.sh` for restart-tolerance similar to `pr.sh`'s `gh pr list --head` reuse pattern, or (c) inspect the recorded `commit.sh` stderr (not in `log.jsonl`) before re-attempting. Planner should propose a concrete diagnostic path; do not re-do build work that's already correct.
- **Should the planner re-stage the pre-existing modifications, or trust the engine's `commit` step to pick them up?** The build step's contract is to leave the working tree dirty for `commit.sh` — but a *retry* arrives with the prior pass's dirty tree already present. Planner should confirm `commit.sh`'s behavior on a dirty tree with no fresh changes from the current pass's build step.
- **What does the new build pass do given an already-clean acceptance state?** SPEC requires the same six tasks cycle 0026 enumerated, but every one is already in the working tree. The planner needs to decide: re-issue the same tasks (build step idempotent → no-ops + verification) vs. collapse to a verification-only build vs. skip build entirely. RFC-001 step-restart-tolerance work (`docs/RFC-001-issue-lifecycle.md:417` "Step-level restart tolerance audit") is open and explicitly notes this gap.
- **Out-of-scope debris in the working tree** — cycle 0025's untracked reflection raws, `REFLECTION.md`, and the `failed-blocked-frontmatter.md` `todo/ → done/` move are all present. They are **not** part of this cycle's SPEC. Planner should confirm whether `commit.sh` filters by path (it should, per cycle 0025 having already merged frontmatter changes) so this cycle doesn't accidentally sweep them in.
- **`BRIEF.md` scope** — sits at repo root, not under `docs/`. SPEC's sweep paths exclude it. ~9 deprecated-folder hits remain in `BRIEF.md` (lines 145, 310-311, 421, 456-457, 504, 527-528, 536, 538). Plan should confirm whether to extend annotation to `BRIEF.md` or treat it as explicitly out of scope per the SPEC's enumerated sweep paths.
```

Research doc emitted to stdout for engine capture. Key finding: cycle 0026 already applied every SPEC mutation; it failed at `commit` (exit 128), and cycle 0027 inherits the dirty working tree. Planner must focus on commit-step diagnosis + restart-tolerant build, not redo the cleanup.
