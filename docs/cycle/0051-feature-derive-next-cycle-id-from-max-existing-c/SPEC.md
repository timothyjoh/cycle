# SPEC — Cycle 0051: Derive next cycle-id from max(existing cycle dirs, log)

## WHY
The per-cycle directories under `docs/cycle/` (`0001-…` … `0258-…`) are committed to git, but `.cycle/log.jsonl` is runtime state and gitignored. After a fresh clone/checkout the committed cycle folders are restored while the log starts empty. `allocateCycleId` (`src/engine/cycle-id.ts`) derives the next number from the log alone, so on an empty/absent log it restarts numbering from `0001` and creates folders that collide with the historical ones of the same number. This already happened on this machine: two `0048-feature-…` directories now coexist (the old committed one and a fresh one), and downstream observers (maestro) read the live counter as `0048` for a repo with 257 cycles of real history.

## CONCRETE USER BENEFIT
After this cycle, an operator who runs `cycle run` in a freshly checked-out repo (committed cycle history present, empty/absent `.cycle/log.jsonl`) gets the next monotonic cycle number — e.g. `0259` for a repo whose highest committed dir is `0258` — instead of `0001`. No new cycle directory ever collides with an existing `docs/cycle/NNNN-*` folder, and an external observer reading the counter sees the true high-water mark.

## USABLE END-STATE
`allocateCycleId(repoRoot)` returns `max(highest docs/cycle/NNNN-* dir, highest log cycle_id) + 1`, zero-padded to 4 digits. On a fresh checkout with cycle dirs up to `0258` and an empty log, the next allocated id is `0259`. On an intact log whose max already meets or exceeds the dir set, behavior is unchanged.

## Objective
Change the next-cycle-id allocation so it takes the maximum of the highest committed `docs/cycle/NNNN-*` directory basename and the highest `cycle_id` in `.cycle/log.jsonl`, then increments. This makes cycle numbering monotonic and collision-free across a fresh checkout or wiped log, while leaving the common intact-log path byte-for-byte identical.

## Source Issue
`fix-next-cycle-id-derivation-survive-log-reset` — "Derive next cycle-id from max(existing cycle dirs, log) so a wiped log on fresh checkout can't restart numbering and collide"

## Scope

### In Scope
- Extend `allocateCycleId` in `src/engine/cycle-id.ts` to also scan `docs/cycle/` for the highest `^\d{4}-` directory basename and fold it into the `max` before incrementing.
- Make the `docs/cycle/` read bounded and fail-safe: a single `readdir`, regex-matched basenames, and a `try/catch` that degrades to the log-derived id when `docs/cycle/` is unreadable or absent.
- Add unit-test coverage for the new behavior in `tests/engine/cycle-id.test.ts`.

### Out of Scope
- Reconciling or renaming the already-collided `0048-*` directories that exist on this machine — this fix prevents future collisions, it does not repair past ones.
- Any change to how `cycle_id` is consumed downstream (`run-one`, queue, branch naming, artifact-dir computation).
- Backfilling or rewriting `.cycle/log.jsonl`.

## Requirements
- `allocateCycleId(repoRoot)` returns `String(max(highestDir, highestLogId) + 1).padStart(4, "0")`, where `highestDir` is the largest integer parsed from a `docs/cycle/` entry whose basename matches `^(\d{4})-`.
- Only directory entries are considered for the dir scan; non-matching names (e.g. `issues/`, files) are ignored without error.
- The dir-set read is a single `readdir` plus per-entry regex; no recursive traversal, no per-entry `stat` beyond what `readdir({ withFileTypes: true })` already provides.
- When `docs/cycle/` is missing or unreadable, the function falls back to the log-derived id (current behavior) rather than throwing.
- When `.cycle/log.jsonl` is missing/empty, the result is driven entirely by the dir scan.
- The intact-log common path (where the log max ≥ the dir max) produces the identical id it does today.
- **Failure behavior**: A `readdir` error on `docs/cycle/` is caught and treated as "no directory contribution" (highestDir = 0); the log scan still runs and its result is returned. The log-read error path already degrades to highest = 0 and is preserved. Malformed directory basenames (non-4-digit prefixes, non-numeric) are skipped, not raised. The function never throws; if both sources yield nothing it returns `0001`. Errors that prevent a directory read are swallowed only at the directory-scan boundary — the overall allocation still completes and returns a valid id.

## Acceptance Criteria
- [ ] With `docs/cycle/` pre-seeded with dirs `0001-…` through `0258-…` and an empty (or absent) `.cycle/log.jsonl`, `allocateCycleId` returns `"0259"` (the user-observable benefit: fresh-checkout numbering no longer restarts at `0001`).
- [ ] With a log whose max `cycle_id` is `0300` and a `docs/cycle/` whose highest dir is `0258`, `allocateCycleId` returns `"0301"` (log-dominant common path unchanged).
- [ ] With a log whose max is `0050` and a `docs/cycle/` whose highest dir is `0258`, `allocateCycleId` returns `"0259"` (dir-dominant path).
- [ ] **Failure-path**: when `docs/cycle/` does not exist (or `readdir` rejects), `allocateCycleId` does not throw and returns the log-derived id (e.g. log max `0050` ⇒ `"0051"`).
- [ ] Non-matching entries under `docs/cycle/` (e.g. an `issues/` dir, a stray file, a `cycle-notes.md`) are ignored and do not affect the result.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Framework: the repo's `node:test` suite, extending `tests/engine/cycle-id.test.ts`.
- Use real temp directories (per the repo convention that `node:fs/promises` cannot be stubbed via `mock.method`): create a temp `repoRoot`, populate `docs/cycle/NNNN-…` directories and a `.cycle/log.jsonl`, then assert the returned id.
- Key scenarios: fresh checkout (dirs present, empty log) ⇒ `0259`; log-dominant; dir-dominant; missing `docs/cycle/` (failure path) ⇒ log-derived; missing/empty log ⇒ dir-derived; non-matching entries ignored; both sources empty ⇒ `0001`.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: no convention or command change required; `allocateCycleId` is internal. If the `src/engine/cycle-id.ts` module gains a documented per-file coverage floor as part of this cycle, record it in the Coverage policy table.
- **README.md**: no user-facing surface change.

This is a behavioral correctness fix to an internal allocation function; documentation impact is limited to the coverage-floor note above if a floor is added.

## Dependencies
- `src/engine/cycle-id.ts` (`allocateCycleId`) — the single allocation site, already imported by `src/engine/run-cycle.ts`.
- `docs/cycle/` directory layout with `NNNN-<workflow>-<slug>` committed cycle folders (already present).
- No external services or env vars required.
