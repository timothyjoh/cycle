# Implementation Plan: Cycle 0052

## Overview
Un-ignore `.cycle/log.jsonl` and `.cycle/tbd.jsonl` so they become git-tracked committed state-of-record, add explicit (existence-guarded) staging of both paths in `commitCycle`, and reconcile the docs that still call them gitignored — so a fresh clone carries the full run history and live queue and cycle-id numbering never restarts from the low end.

## Current State (from Research)
- `.gitignore:5-6` are the only two ignore rules for these files; there is **no** `src/defaults/.gitignore` and **no** `.cycle/.gitignore` — the repo-root `.gitignore` is the sole ignore source.
- `stageFiles` (`src/engine/commit-cycle.ts:61-103`) is `git status --porcelain --untracked-files=all`-driven: it skips `isDenied`/gitlink paths and uses an `existsSync` guard to choose `git add -- <p>` (existing) vs `git add -u -- <p>` (deletion). `isDenied` (`src/engine/path-utils.ts:4`) does **not** deny the two state files, so once un-ignored they pass the filter.
- The residue guard's `isEngineOwned` (`src/engine/failed-residue-guard.ts:39-45`) excludes the whole `.cycle/**` tree, so tracking these files cannot trip the dirty-worktree halt.
- Tests use a deterministic `makeSpawn(intercept)` stand-in over a real temp repo, recording invocations into a `calls[]` array (`tests/engine/commit-cycle.test.ts:24-95`). Per-file coverage floor for `commit-cycle.ts` is **95%**.
- Docs to reconcile: `docs/ARCHITECTURE.md:278` ("the gitignored log starts empty"), `docs/ENGINE.md:66` (engine-owned exclusion note), and the CLAUDE.md `cycle upgrade` row.

### Resolved Open Questions
1. **Ephemeral-sibling ignore status.** Live `git check-ignore` confirms `engine.lock`, `cycle.pid`, `coverage.lcov`, `.sync-state.json` are ignored, but `.cycle/run.log`, `.cycle/.env`, `.cycle/failed-residue-context.json` are **not** ignored — and `.env`/`run.log` are already *tracked* (`git ls-files`). **Decision:** this cycle's `.gitignore` edit removes **only** the two target lines and adds **no** new ignore rules. Adding rules for `run.log`/`.env` would untrack already-committed files — a behavior change explicitly outside this narrowly-scoped cycle ("Out of Scope: Un-ignoring or committing any other `.cycle/**` file"). The pre-existing tracked/un-ignored status of those three siblings is a separate concern recorded in `BUILD.md`, not fixed here. See the SPEC Acceptance Traceability note on the AC #3 bullet.
2. **Explicit vs implicit staging.** Implicit `git status`-driven staging *would* pick the files up once dirty, but the SPEC permits explicit staging to make the guarantee unconditional and the missing-file skip deterministically testable. **Decision:** add explicit, `existsSync`-guarded staging of both paths in `stageFiles` so the commit guarantee never depends on the files happening to appear dirty.
3. **Initial bulk commit of pre-existing contents.** Accepted. Once un-ignored, this cycle's own `commitCycle` stages the full current contents of both files into this cycle's commit; that is the intended one-time bulk-add.

## Desired End State
- `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` reports neither as ignored; `git ls-files` lists both.
- `commitCycle` explicitly stages both paths (existence-guarded) every cycle; `git show --stat HEAD` lists both after any cycle.
- `engine.lock`, `cycle.pid`, `coverage.lcov`, `.sync-state.json` remain ignored.
- Docs no longer assert the log is gitignored/empty; the residue-excluded-≠-untracked distinction is stated.
- `commit-cycle.ts` coverage ≥ 95%; all existing tests pass; no typecheck warnings.

Verify: `git check-ignore`, `git ls-files`, `npm test`, `npm run test:coverage`, `npm run typecheck`, and a post-cycle `git show --stat HEAD`.

## What We're NOT Doing
- No log compaction, rotation, or truncation (append-only, never truncated).
- No change to `cycle upgrade` behavior — its contract of never touching file *contents* is confirmed in writing, not modified.
- No change to cycle-id derivation (`src/engine/cycle-id.ts`) — addressed in cycle 0051.
- No new ignore rules for `run.log`/`.env`/`failed-residue-context.json`, and no untracking of the already-tracked `.env`/`run.log` (out of scope).
- No un-ignoring or committing of any other `.cycle/**` file.
- No `src/defaults/.gitignore` creation (none exists; nothing generates one).

## Implementation Approach
Two coupled changes plus docs. (1) Delete the two ignore lines from `.gitignore`. (2) In `src/engine/commit-cycle.ts`, introduce a `STATE_FILES` constant and an explicit, `existsSync`-guarded staging pass inside `stageFiles` that runs `git add -- <path>` for each existing state file — placed before the final `git diff --cached --quiet` check so the staged set always includes them when present. A missing file is silently skipped (no `git add`), preserving the fresh-repo case. (3) Reconcile docs. Explicit staging is preferred over relying on the status loop because it makes the guarantee unconditional and the missing-file skip directly testable via the injected `SpawnFn`. This cycle's own `commitCycle` performs the initial bulk-add of existing contents.

## Failure & Resilience Decisions

**Task 1 (`.gitignore` edit)** — N/A — pure text edit; no runtime failure surface. (Its effect on git tracking is exercised by Task 3 acceptance commands.)

**Task 2 (explicit `STATE_FILES` staging in `stageFiles`)**
- **Failure modes:** (a) File absent (fresh repo before first cycle) → `existsSync` is false, the path is skipped, no `git add` runs, no error — `stageFiles` proceeds. (b) `git add` returns non-zero (e.g. transient git error) → the `SpawnFn` returns a status code rather than throwing (consistent with the existing loop, which also does not separately inspect each `git add` status); the failure surfaces downstream via the `git diff --cached --quiet` "nothing staged" result and/or the subsequent `git commit`, which routes to `commitCycle`'s `{ status: "failed", reason: "commit_failed" }` path — never silently swallowed. We deliberately do **not** add a new throw, matching the established staging-loop contract so behavior stays uniform.
- **Idempotency:** `git add -- <path>` on an already-staged or unchanged file is a no-op; the explicit pass is safe to re-run. The engine retries/restarts `commitCycle` at most once per cycle, and re-running over engine-owned `.cycle/**` files cannot trip the residue guard (`isEngineOwned` excludes the tree). Staging twice (once via the status loop if dirty, once via the explicit pass) is harmless — git coalesces.
- **Observability:** Ordinary staging emits no event today (matching the existing loop). The two staged paths are observable in the committed result (`git show --stat HEAD`) and, on failure, in the existing `commit_failed`/`push_failed` events and the append-only `.cycle/log.jsonl`. No new silent path is introduced.
- **No silent failure:** A missing file is a designed skip (not an error). A genuine `git add`/commit failure surfaces through the unchanged commit-failure return path. No `try/catch` swallows anything; the `existsSync` guard is the only branch and it has a defined, observable outcome on both arms.

**Task 3 (docs)** — N/A — pure documentation edits; no runtime failure surface.

---

## Task 1: Un-ignore the two state files in `.gitignore`

### Overview
Remove the two ignore rules so git begins tracking `.cycle/log.jsonl` and `.cycle/tbd.jsonl`. No other lines change.

### Changes Required
**File**: `.gitignore`
**Changes**: Delete lines 5-6:
```
.cycle/log.jsonl
.cycle/tbd.jsonl
```
Leave `.cycle/cycle.pid`, `.cycle/.sync-state.json`, `.cycle/coverage.lcov`, and `.cycle/engine.lock` intact. Do **not** add any new ignore rules.

No `src/defaults/.gitignore` exists and nothing generates a per-repo ignore file (confirmed in RESEARCH); record this explicitly in `BUILD.md` so the omission is intentional. `npm run sync-defaults` is therefore not required for an ignore source, but run it if any `src/defaults/` file is otherwise touched.

### Success Criteria
- [ ] `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` reports neither file (exit non-zero / no output).
- [ ] `git check-ignore` still reports `engine.lock`, `cycle.pid`, `coverage.lcov`, `.sync-state.json` as ignored.
- [ ] `BUILD.md` records that no `src/defaults/.gitignore` / generated ignore source exists.

---

## Task 2: Explicitly stage `.cycle/log.jsonl` + `.cycle/tbd.jsonl` in `commitCycle`

### Overview
Add an existence-guarded explicit staging pass for the two state files inside `stageFiles`, so every cycle's commit deterministically includes them when present and gracefully skips them when absent.

### Changes Required
**File**: `src/engine/commit-cycle.ts`

Add a module-level constant near the top:
```ts
/** Engine state-of-record files committed with every cycle (un-ignored cycle 0052). */
const STATE_FILES = [".cycle/log.jsonl", ".cycle/tbd.jsonl"] as const;
```

In `stageFiles`, after the `git status` loop (`commit-cycle.ts:99`) and **before** the `git diff --cached --quiet` check (`commit-cycle.ts:101`), add the explicit pass:
```ts
// Explicitly stage the committed state-of-record files. existsSync guards the
// fresh-repo case (file not yet written) — a missing file is skipped, not an error.
for (const sf of STATE_FILES) {
  if (existsSync(join(repoRoot, sf))) {
    spawn("git", ["add", "--", sf], { cwd: repoRoot, env });
  }
}
```
Notes:
- Reuses the already-imported `existsSync` and `join`, and the in-scope `env` from `stageFiles`.
- The two paths are not denied by `isDenied`, so they would also be picked up by the status loop when dirty; the explicit pass makes the guarantee unconditional and idempotent (double-add is a git no-op).
- No change to the `git diff --cached --quiet` "nothing staged" return, the gitlink filter, or `commitCycle`'s orchestration.

### Success Criteria
- [ ] Compiles/typechecks cleanly (`npm run typecheck`).
- [ ] New unit test: given a dirty `.cycle/log.jsonl` and `.cycle/tbd.jsonl` in the temp repo, both appear in recorded `git add -- <path>` invocations before commit.
- [ ] New failure-path unit test: with one or both state files **absent**, `commitCycle` completes without error and issues **no** `git add` for the missing path(s) (no crash, commit of other changes still proceeds).
- [ ] Existing `commit-cycle`, residue-guard, and cycle-id tests still pass.
- [ ] Residue guard does not trip on the now-tracked files (regression check).
- [ ] `src/engine/commit-cycle.ts` coverage ≥ 95%; numbers reported in `BUILD.md`.

---

## Task 3: Reconcile documentation

### Overview
Update docs that describe the log/queue as gitignored or empty, and confirm-in-writing the `cycle upgrade` contents contract is unchanged.

### Changes Required
**File**: `docs/ARCHITECTURE.md`
**Changes**: Line ~278 — replace "the gitignored log starts empty" with a statement that `.cycle/log.jsonl` is now git-tracked, committed per cycle, and travels with the repo (so a clone carries full history and the next cycle-id derives from the real high-water mark). Reconcile the `.cycle/tbd.jsonl` description (~line 468) to note it is the committed live queue.

**File**: `docs/ENGINE.md`
**Changes**: Line ~66 — clarify the engine-owned-exclusion note: `.cycle/log.jsonl` / `tbd.jsonl` are residue-excluded **and now git-tracked/committed** (residue-excluded ≠ untracked). The remaining `.cycle/**` runtime files stay excluded-and-ignored.

**File**: `CLAUDE.md`
**Changes**: Where the `cycle upgrade` row / Architecture notes reference these files as state, add a clarifying clause that git now **tracks** them and `commitCycle` commits them every cycle, while `cycle upgrade` still **never** modifies their *contents* (contract confirmed, not changed).

**File**: `README.md` (only if user-facing setup docs mention these files)
**Changes**: Surface that the log and queue are committed state and travel with a clone. If README has no such mention, record in `BUILD.md` that no README change was needed.

### Success Criteria
- [ ] No doc still asserts the log is gitignored or starts empty.
- [ ] `docs/ENGINE.md` states residue-excluded ≠ untracked for the two files.
- [ ] CLAUDE.md confirms `cycle upgrade` contents contract is preserved and git now tracks the files.
- [ ] Markdown renders cleanly; no broken cross-references.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` reports neither file as ignored, and `git ls-files .cycle/log.jsonl .cycle/tbd.jsonl` lists both (user-observable: a clone now carries the log and queue). | Task 1 (un-ignore) + Task 2 (staging adds them to the index this cycle) | `git ls-files` lists them after this cycle's `commitCycle` stages them. |
| [ ] After a cycle completes, `git show --stat HEAD` lists `.cycle/log.jsonl` and `.cycle/tbd.jsonl` among the changed files. | Task 2 | Explicit existence-guarded staging guarantees inclusion every cycle. |
| [ ] `engine.lock`, `run.log`, `.env`, `failed-residue-context.json`, `cycle.pid`, `coverage.lcov`, and `.sync-state.json` are still reported as ignored by `git check-ignore`. | Task 1 (for `engine.lock`, `cycle.pid`, `coverage.lcov`, `.sync-state.json`); **WAIVED — for `run.log`, `.env`, `failed-residue-context.json`** | Live `git check-ignore` shows `run.log`/`.env`/`failed-residue-context.json` are **not** currently ignored (and `.env`/`run.log` are already tracked). Making them ignored would untrack committed files — outside this cycle's "only un-ignore log.jsonl + tbd.jsonl" scope and forbidden by Out-of-Scope. This cycle adds no new ignore rules; the four genuinely-ignored files remain ignored. The pre-existing status of the other three is recorded in `BUILD.md`. |
| [ ] A `commit-cycle` unit test asserts that, given a dirty `.cycle/log.jsonl` and `.cycle/tbd.jsonl`, both paths are staged (appear in the injected spawn's `git add` invocations or in the staged set) before commit. | Task 2 | Asserted via the `calls[]` recording pattern. |
| [ ] **Failure-path**: a `commit-cycle` test asserts that when `.cycle/log.jsonl` (or `tbd.jsonl`) is absent, `commitCycle` completes without error and does not attempt to add the missing path as an existing file (observable: no crash, commit proceeds, and the missing path is not staged via the existing-file branch). | Task 2 | `existsSync` guard skips the absent path; test asserts no `git add -- <missing>`. |
| [ ] All existing tests still pass. | Tasks 2, 3 | Verified via `npm test`. |
| [ ] `src/engine/commit-cycle.ts` coverage stays at or above its 95% floor; coverage does not decrease vs the master baseline. Numbers reported in `BUILD.md`. | Task 2 | New tests cover both staging arms. |
| [ ] No compiler/linter/typecheck warnings introduced. | Tasks 2, 3 | `npm run typecheck` clean. |

---

## Testing Strategy

### Unit Tests
Add to `tests/engine/commit-cycle.test.ts`, reusing `makeSpawn`/`setupRepo` and the `calls[]` assertion pattern:
- **State-file staging (happy path):** write non-empty `.cycle/log.jsonl` + `.cycle/tbd.jsonl` into the temp repo, run `commitCycle`, assert `calls` contains `git add -- .cycle/log.jsonl` and `git add -- .cycle/tbd.jsonl` and that a `git commit` follows.
- **Missing-file skip (failure path):** ensure `.cycle/log.jsonl` does **not** exist (delete or never create) while another in-scope change exists; run `commitCycle`; assert **no** `git add -- .cycle/log.jsonl` invocation, no crash, and the commit proceeds for the other change. Repeat for `tbd.jsonl` absent.
- **Both absent + no other change:** assert `commitCycle` returns `{ status: "skipped", reason: "nothing_to_commit" }` (the explicit pass adds nothing, the `git diff --cached --quiet` skip path holds).
- **Idempotency:** staging when the file is already clean/staged produces a harmless no-op (covered implicitly by the happy-path test running against a real temp git repo via `defaultSpawn` delegation).
- **Mocking strategy:** prefer the existing real-temp-repo delegation in `makeSpawn`; intercept only where a deterministic recording is needed. No heavy mocking — real `git` drives staging.

### Integration / E2E Tests
- **Ignore-status assertion (shell-level, in this cycle's verification):** after the `.gitignore` edit, run `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` (expect no match) and `git check-ignore .cycle/engine.lock .cycle/cycle.pid .cycle/coverage.lcov .cycle/.sync-state.json` (expect match) — recorded in `BUILD.md`.
- **Residue-guard regression:** confirm the now-tracked files do not appear as residue (covered by existing `failed-residue-guard` tests; add no new test unless a gap surfaces — `isEngineOwned` already excludes `.cycle/**`).
- No UI changes; no new E2E harness required (SPEC: "No UI changes; no E2E tests required").

## Risk Assessment
- **Double-staging via both the status loop and the explicit pass:** Harmless — `git add` is idempotent and git coalesces identical staged content. Mitigation: explicit pass is existence-guarded and additive only.
- **AC #3 partial divergence (run.log/.env/failed-residue-context.json not ignored):** Surfaced honestly in the traceability waiver and `BUILD.md`; not silently dropped. Mitigation: scope kept minimal; no untracking of already-committed files.
- **Initial bulk-add of large pre-existing log contents:** One-time, expected, and bounded (append-only file already on disk). Mitigation: documented as the intended initial commit; no truncation attempted.
- **`git add` on an ignored file failing in a foreign repo:** Not applicable here — the files are un-ignored in this repo and test temp repos have no `.gitignore`; the `existsSync` guard + status-code-returning `SpawnFn` keep any failure on the existing commit-failure path.
