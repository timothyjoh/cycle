# SPEC — Cycle 0096: Add todo/blocked Dedup Gate to ingestReflection

## Objective
Extend `ingestReflection` in `src/engine/reflection.ts` to suppress sharp-edge entries whose normalized title slug already appears (as a substring) in any existing filename under `docs/cycle/issues/todo/` or `docs/cycle/issues/blocked/`. Without this gate, false-positive-success cycles cause the engine to accumulate N identical todo entries for the same unfixed issue — all unresolvable until the root cause is cleared.

## Source Issue
`refl-0085-reflection-surfacing-does-not-dedup-agai` — "Add todo/blocked dedup gate to ingestReflection to suppress duplicate sharp-edge surfacing"

## Scope

### In Scope
- Read `todo/` and `blocked/` directory listings inside `ingestReflection` before writing any `raw/refl-*.md`.
- Normalize each existing filename (strip `.md`, lowercase, collapse non-alphanumeric runs to `-`, trim edges) and build a combined Set.
- Normalize each candidate `sharp_edges` entry title using the same scheme (capped at 60 chars).
- Suppress any entry whose normalized title slug is a substring of any combined-set member; emit `reflection.skipped { reason: "dedup", cycle_id, title, matched_file }` instead of `reflection.surfaced`.
- Fail-open on `readdir` errors other than ENOENT: emit `reflection.warning { reason: "dedup_read_error", dir, error }` and skip dedup for that directory only.
- Update `reflection.summary` to count only written entries in `count`; add `suppressed_count` when any were suppressed.
- Unit tests covering all six required scenarios (see Acceptance Criteria).

### Out of Scope
- Deduplication against `raw/`, `done/`, or `failed/` directories.
- Fuzzy/semantic title matching beyond the substring check described in the issue.
- Changing the existing in-cycle dedup (log.jsonl scan for prior `reflection.surfaced` ids).
- Any changes to the triage subroutine, CLI, or other engine files.

## Requirements
- `ingestReflection` must read `todo/` and `blocked/` listings before the per-entry write loop.
- ENOENT on either directory must be treated as an empty set (no error, no warning).
- Any other `readdir` error on a directory emits `reflection.warning { reason: "dedup_read_error", dir, error }` and skips dedup for that directory (fail-open: the other directory's results still apply).
- Normalization for filenames: strip `.md`, lowercase, replace `/[^a-z0-9]+/g` with `-`, trim leading/trailing `-`.
- Normalization for candidate titles: `entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)`.
- Suppression condition: normalized title slug is a **substring** of any normalized filename in the combined todo+blocked set.
- Suppressed entries emit `reflection.skipped { reason: "dedup", cycle_id, title: entry.title, matched_file: "<relative path>" }`.
- `matched_file` must be the repo-relative path (e.g., `docs/cycle/issues/todo/<filename>.md`).
- `reflection.summary` `count` field must count only written entries; add `suppressed_count` field (number) when ≥ 1 entry was suppressed.
- The new dedup gate runs **before** the existing in-cycle dedup (log.jsonl) check.

## Acceptance Criteria
- [ ] Entry whose normalized title slug matches a filename in `todo/` is suppressed; no `raw/refl-*.md` written; `reflection.skipped { reason: "dedup", … }` emitted.
- [ ] Entry whose normalized title slug matches a filename in `blocked/` is suppressed identically.
- [ ] Entry with no matching filename in either directory is written to `raw/` as normal.
- [ ] ENOENT on `todo/` directory is handled gracefully (treated as empty; no warning emitted; no suppression from that dir).
- [ ] ENOENT on `blocked/` directory is handled gracefully (treated as empty; no warning emitted).
- [ ] Both directories empty → no suppression; all valid entries written.
- [ ] Non-ENOENT `readdir` error on one directory emits `reflection.warning { reason: "dedup_read_error", dir, error }` and fails open (dedup skipped for that dir only).
- [ ] `reflection.summary.count` equals the number of actually-written files; when any suppressed, `suppressed_count` is present and correct.
- [ ] All existing `reflection.test.ts` tests remain green.
- [ ] `npm test` passes; `npm run typecheck` passes; no new compiler warnings.
- [ ] Coverage does not decrease from master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Testing Strategy
- Framework: Node native test runner (`node:test`), matching existing `tests/engine/reflection.test.ts` patterns.
- Add new test cases to `tests/engine/reflection.test.ts`:
  - `dedup suppression when todo/ contains a matching filename` — create a tmp dir with `todo/` holding a file whose name contains the candidate's slug; assert no `raw/` file written, `reflection.skipped {reason:"dedup"}` emitted.
  - `pass-through when no filename matches` — `todo/` and `blocked/` both present but with unrelated filenames; assert file written normally.
  - `ENOENT on todo/ dir is graceful` — create tmp dir with no `todo/` subdir; assert no crash, no warning, entry written.
  - `ENOENT on blocked/ dir is graceful` — same for missing `blocked/`.
  - `both dirs empty = no suppression` — both present but empty; assert entry written.
  - `suppressed_count present in summary when suppression occurs` — verify `reflection.summary` payload shape.
- Use `tmp` directories created via `mkdtemp` (pattern used throughout existing tests).
- No mocking of `readdir` — test against real filesystem state within tmp dirs.

## Documentation Updates
- **CLAUDE.md**: Update the "Reflection step" architecture note to mention the new dedup gate (todo/blocked cross-run dedup, fail-open on read errors, `reflection.skipped { reason: "dedup" }` event).
- **README.md**: No user-facing change required (dedup is internal engine behavior).

## Dependencies
- `src/engine/reflection.ts` at current HEAD — no prior cycle changes required.
- `tests/engine/reflection.test.ts` — existing test file to extend (do not create a new file).
- Node `fs/promises.readdir` — already imported in the module.
