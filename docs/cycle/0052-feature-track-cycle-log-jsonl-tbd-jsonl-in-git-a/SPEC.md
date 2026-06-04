# SPEC — Cycle 0052: Track `.cycle/log.jsonl` + `.cycle/tbd.jsonl` in git as committed state-of-record

## WHY
`.cycle/log.jsonl` (the append-only run/event log) and `.cycle/tbd.jsonl` (the queue) are currently gitignored, so they do not travel with the repository. A fresh clone starts with an empty log and an empty queue — but these files *are* the engine's state-of-record. A re-clone therefore loses all run history and the pending queue, and (because the next cycle-id is derived from the log) restarts cycle numbering from the low end, producing colliding cycle directories. The two files must be tracked in git and committed every cycle so the engine's record-of-truth always accompanies the repo.

## CONCRETE USER BENEFIT
After this cycle, a user who clones (or re-clones) the repository gets the complete run history and the live queue immediately, and the next cycle continues numbering monotonically from the real high-water mark instead of restarting and clobbering existing cycle directories. Running `git show --stat HEAD` after any cycle visibly lists `.cycle/log.jsonl` and `.cycle/tbd.jsonl` among the committed files.

## USABLE END-STATE
The two state files are tracked in git and advance with committed history every cycle. A clone of the repo carries the full append-only log and the current queue. The genuinely-ephemeral runtime files (`engine.lock`, `run.log`, `.env`, `failed-residue-context.json`, generated `--settings`, `cycle.pid`, `coverage.lcov`, `.sync-state.json`) remain ignored. `cycle upgrade` continues to leave the *contents* of the two files untouched.

## Objective
This cycle un-ignores `.cycle/log.jsonl` and `.cycle/tbd.jsonl` and ensures `commitCycle` stages and commits them as part of every cycle's commit, making the engine's run history and queue committed state-of-record that travels with the repository. It delivers the root-cause fix for cross-clone cycle-id collisions by guaranteeing the log the id-derivation reads is never empty on a fresh checkout.

## Source Issue
`track-log-and-tbd-as-committed-state-of-record` — "Track .cycle/log.jsonl + tbd.jsonl in git as committed state-of-record"

## Scope

### In Scope
- Remove `.cycle/log.jsonl` and `.cycle/tbd.jsonl` from this repo's `.gitignore` (and from any shipped/engine-generated ignore source if one exists — none currently does; if absent, the repo `.gitignore` is the only ignore source to change), then `git add` the two now-tracked files so they enter version control this cycle.
- Ensure `commitCycle` (`src/engine/commit-cycle.ts`) stages `.cycle/log.jsonl` and `.cycle/tbd.jsonl` alongside the cycle's other changes so committed history advances every cycle, with coverage at the file's 95% floor.
- Update documentation that asserts the log/queue are gitignored or start empty (`docs/ARCHITECTURE.md` "gitignored log starts empty"; CLAUDE.md / `docs/ENGINE.md` notes if they describe these as ignored), and confirm-in-writing that `cycle upgrade` still never overwrites their contents.

### Out of Scope
- Log compaction, rotation, or truncation — the log is append-only and is never truncated (explicitly forbidden by the issue).
- Any change to `cycle upgrade`'s behavior — it must continue to leave file *contents* untouched; this cycle only changes whether git *tracks* the files.
- Changes to the cycle-id derivation logic itself (`src/engine/cycle-id.ts`), which was addressed in cycle 0051; this cycle fixes the underlying cause (empty log on clone) rather than the derivation.
- Un-ignoring or committing any other `.cycle/**` file.

## Requirements
- `.cycle/log.jsonl` and `.cycle/tbd.jsonl` are no longer matched by any ignore rule and are tracked in git (`git check-ignore` returns non-zero / no match for both; `git ls-files` lists both).
- `engine.lock`, `run.log`, `.env`, `failed-residue-context.json`, generated `--settings` files, `cycle.pid`, `coverage.lcov`, and `.sync-state.json` remain ignored.
- After a cycle's commit, the commit contains the updated `.cycle/log.jsonl` and `.cycle/tbd.jsonl`. Staging integrates with the existing `stageFiles` flow (the two paths are not denied by `isDenied`, so once un-ignored they are picked up by the standard `git status`-driven staging); if relied-upon implicit staging is fragile, add explicit staging of the two paths so the guarantee does not depend on them happening to appear dirty.
- `cycle upgrade` continues to never modify the contents of either file (existing contract preserved; verified, not changed).
- If `src/defaults/` ships a `.gitignore` or any code generates the per-repo ignore, the same un-ignore is applied there and `npm run sync-defaults` is run; if no such source exists, this is recorded explicitly in `BUILD.md` so the omission is intentional, not overlooked.
- **Failure behavior**: When `.cycle/log.jsonl` or `.cycle/tbd.jsonl` does not yet exist (e.g. a fresh repo before its first cycle), `commitCycle` must not error or fail the commit — a missing file is skipped, not treated as a fatal staging failure (the existing `existsSync` guard in `stageFiles` covers this; the explicit-staging path, if added, must preserve it). A `git add` failure for these paths surfaces through the existing commit-failure path (returned/logged), never silently swallowed. Because the files are tracked, no part of the commit-staging change may cause the residue guard to trip — `.cycle/**` is already engine-owned/excluded.

## Acceptance Criteria
- [ ] `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` reports neither file as ignored, and `git ls-files .cycle/log.jsonl .cycle/tbd.jsonl` lists both (user-observable: a clone now carries the log and queue).
- [ ] After a cycle completes, `git show --stat HEAD` lists `.cycle/log.jsonl` and `.cycle/tbd.jsonl` among the changed files.
- [ ] `engine.lock`, `run.log`, `.env`, `failed-residue-context.json`, `cycle.pid`, `coverage.lcov`, and `.sync-state.json` are still reported as ignored by `git check-ignore`.
- [ ] A `commit-cycle` unit test asserts that, given a dirty `.cycle/log.jsonl` and `.cycle/tbd.jsonl`, both paths are staged (appear in the injected spawn's `git add` invocations or in the staged set) before commit.
- [ ] **Failure-path**: a `commit-cycle` test asserts that when `.cycle/log.jsonl` (or `tbd.jsonl`) is absent, `commitCycle` completes without error and does not attempt to add the missing path as an existing file (observable: no crash, commit proceeds, and the missing path is not staged via the existing-file branch).
- [ ] All existing tests still pass.
- [ ] `src/engine/commit-cycle.ts` coverage stays at or above its 95% floor; coverage does not decrease vs the master baseline. Numbers reported in `BUILD.md`.
- [ ] No compiler/linter/typecheck warnings introduced.

## Testing Strategy
- Node built-in test runner (`node --test`) via `npm run test:coverage`, consistent with the existing `commit-cycle` tests.
- Inject the deterministic `SpawnFn` stand-in already used in `commit-cycle` tests to drive staging without a real repo; assert that `.cycle/log.jsonl` and `.cycle/tbd.jsonl` reach `git add` when reported dirty by the stubbed `git status`.
- Failure paths: missing file (skip-not-crash), and confirm denied/engine-owned exclusions still hold (the two files are *not* excluded by `isDenied`, ephemeral siblings are).
- Regression: existing `commit-cycle`, residue-guard, and cycle-id tests continue to pass; verify the residue guard does not trip on the now-tracked files.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: If any convention text describes `.cycle/log.jsonl` / `.cycle/tbd.jsonl` as gitignored, update it to state they are tracked, committed-per-cycle state-of-record (the `cycle upgrade` note already correctly says upgrade must not touch their *contents* — confirm it still reads correctly and add a clarifying clause that git now *tracks* them).
- **`docs/ARCHITECTURE.md`**: Update the "gitignored log starts empty" statement (line ~278) to reflect that the log is tracked and travels with the repo.
- **`docs/ENGINE.md`**: Reconcile the engine-owned-exclusion note — `.cycle/log.jsonl` / `tbd.jsonl` are still residue-excluded, but they are now committed rather than ignored; clarify the distinction (residue-excluded ≠ untracked).
- **README.md**: Surface, if user-facing setup docs mention it, that the log and queue are committed state and travel with a clone.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `commitCycle` staging flow (`src/engine/commit-cycle.ts`), `isDenied` (`src/engine/path-utils.ts`), and the residue guard's `.cycle/**` exclusion (`src/engine/failed-residue-guard.ts`) — all already present.
- `git` on PATH (already required by the engine).
- No new external services or env vars.
