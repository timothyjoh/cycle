```markdown
# SPEC — Cycle 0014: BB-3 — tbd.jsonl Drain-Queue Schema and Semantics

## Objective
Replace the legacy `tbd.jsonl` (an inbox-shaped record of raw issues
discovered by `scan.ts`) with the live drain-on-completion queue
defined by RFC-001 §6. Rows now describe queued cycle work (status,
attempt, depends_on, cycle_id-when-in-progress) and the engine mutates
them on every `cycle.end`: success removes the row and ships the file
to `done/`; transient failure increments attempt and resets status;
terminal failure removes the row, moves the file to `failed/` with
failure frontmatter, and calls `propagateBlocked`. The engine also
reads `workflow:` from the popped todo file's frontmatter at
`cycle.start` instead of taking it from a CLI arg. Bootstrap archives
the old jsonl so audit history is preserved.

## Source Issue
`txt-20260513-034347-bb-3-new-tbd-jsonl-row-schema-and-drain` —
"BB-3: New tbd.jsonl row schema and drain semantics …"

## Scope

### In Scope
- New `tbd.jsonl` row schema + read/write/mutate module (per RFC §6)
  with bootstrap-archive of any pre-existing file under the old schema.
- Engine drain semantics on `cycle.end` (ok / failed-retry /
  failed-terminal incl. failed-frontmatter stamp). On terminal failure,
  call a `propagateBlocked` stub (real walk lands in BB-6; this cycle
  ships a no-op-on-empty-deps function with the call site wired and
  unit-tested).
- Engine reads `workflow:` from the popped todo file's frontmatter at
  `cycle.start` (replacing today's fixed `--workflow feature` flow for
  the queue-pop path).

### Out of Scope
- Triage subroutine and raw→todo enrichment (BB-4).
- Resume from `log.jsonl` tail (BB-5).
- Full transitive `propagateBlocked` graph walk + `engine.halted`
  counter (BB-6) — stubbed only.
- Reflection step (BB-7).
- Pop-ordering with `depends_on` skip-and-resume (BB-6 / BB-4 territory;
  this cycle preserves today's FIFO behavior over the new schema).
- Backfilling `todo/<id>.md` files with `workflow:` frontmatter for
  pre-existing items beyond the seven BB-* todos already in the queue.

## Requirements
- **R1.** New module (e.g. `src/engine/queue.ts`) owns parse/serialize
  of `tbd.jsonl` rows against the schema:
  `{ id, parent?, title, status: "pending"|"in_progress", attempt, depends_on, triaged_at, cycle_id? }`.
  Append-row, pop-next-eligible (FIFO, ignore unsatisfied `depends_on`
  by skip — but minimum impl can be plain FIFO since BB-3 ships with
  empty `depends_on` everywhere), mark-in-progress, drain-ok,
  drain-failed-retry, drain-failed-terminal.
- **R2.** Bootstrap: at engine start, if `.cycle/tbd.jsonl` exists and
  any line is non-empty and does NOT parse to the new schema (e.g. no
  `status` field), rename it to `.cycle/tbd.jsonl.bootstrap-archive`
  and start a fresh empty queue. Idempotent — re-running doesn't
  re-archive an already-new file.
- **R3.** Engine `cycle.end` hook drains the in-progress row:
  - ok → remove row; `mv todo/<id>.md done/<id>.md`.
  - failed AND `attempt+1 < max_cycle_attempts` → increment `attempt`,
    set `status: "pending"`, clear `cycle_id`, leave file in `todo/`.
  - failed AND `attempt+1 >= max_cycle_attempts` → remove row;
    `mv todo/<id>.md failed/<id>.md` with `failed_at`,
    `failed_step`, `failed_attempts` appended to the file's frontmatter;
    call `propagateBlocked(id)`.
- **R4.** When the engine pops a row, it reads
  `todo/<id>.md` frontmatter and uses `workflow:` as the workflow name
  passed to `runCycle`. If frontmatter is missing `workflow:`, fall
  back to the CLI default (preserves backwards-compat for the seven
  BB-* todos already in `todo/` without that field).
- **R5.** Status transition on pop: mutate the row in-place to
  `status: "in_progress"` with `cycle_id` set, before `cycle.start`
  emits. Crash mid-cycle leaves the row visible as in-progress (BB-5
  will use this for resume).
- **R6.** `max_cycle_attempts` is read from the active workflow's
  config in `workflows.yml` (RFC §4); default to 3 if absent.

### Non-functional
- Subprocess discipline: no shell, array args, follow `child-env.ts`.
- Coverage on `queue.ts` and the new drain path: line ≥95%, branch
  ≥75%, function ≥90% (project policy).
- All file moves are atomic at the directory level (`rename`), never
  copy-then-delete.
- Frontmatter mutation (R3 terminal, R5) reads + rewrites the file
  preserving body bytes; uses the existing frontmatter helper if one
  exists, otherwise adds a small one in `src/engine/frontmatter.ts`.

## Acceptance Criteria
- [ ] `src/engine/queue.ts` exists with the row schema and the
  operations enumerated in R1.
- [ ] Bootstrap archive path produces
      `.cycle/tbd.jsonl.bootstrap-archive` on first start under the new
      engine when the legacy file is present; second start does not
      re-archive.
- [ ] `cycle.end ok` removes the popped row from `tbd.jsonl` AND moves
      the todo file to `done/`. Verified by integration-style test that
      drives `runCycle` against an in-tree fake workflow.
- [ ] `cycle.end failed` with `attempt < max-1` keeps the row, bumps
      `attempt`, resets `status` to `pending`, clears `cycle_id`. File
      stays in `todo/`.
- [ ] `cycle.end failed` with `attempt == max-1` removes the row, moves
      the file to `failed/`, and the moved file's frontmatter gains
      `failed_at`, `failed_step`, `failed_attempts`.
- [ ] `propagateBlocked` is called from the terminal-failure path
      (verified by spy/stub even though its body is no-op for this
      cycle).
- [ ] Engine pop reads `workflow:` from todo frontmatter when present.
      Verified with a fixture todo carrying `workflow: feature`.
- [ ] All existing tests still pass; new tests added for queue and
      drain.
- [ ] No new compiler/linter warnings; `npm run typecheck` clean.
- [ ] Coverage thresholds hold (line ≥95%, branch ≥75%, func ≥90%).

## Testing Strategy
- Framework: Node's built-in test runner (`node --test`), spec
  reporter, matching the rest of `tests/`.
- Unit tests for `queue.ts`:
  - parse round-trip of every status combination
  - bootstrap detection of legacy-shape lines (no `status` field)
    triggers archive; new-shape lines do not
  - pop is FIFO and skips no-op `depends_on`
  - mark-in-progress mutates only the one row
  - drain-ok / drain-failed-retry / drain-failed-terminal each yield
    the documented residual state on disk
- Integration test that drives the engine through one ok cycle and one
  cycle that exhausts attempts (using a fake workflow with a bash step
  that exits 0 or 1 deterministically). Asserts:
  - file ends up in `done/` or `failed/` correctly
  - `failed/<id>.md` frontmatter contains the three failure keys
  - `propagateBlocked` invoked exactly once for the failed id
- Negative test: engine pops a todo whose frontmatter omits
  `workflow:` — engine falls back to default without throwing.
- No browser/UI surface — Playwright N/A.

## Documentation Updates
- **CLAUDE.md**: add a one-paragraph note under "Architecture quick
  reference" pointing at `src/engine/queue.ts` as the queue authority,
  and mention that `tbd.jsonl` is now a live drain-queue (audit log
  remains `log.jsonl`).
- **README.md**: not user-visible from this cycle (BB-3 is engine-
  internal). No update unless triage flags a gap.
- **docs/RFC-001-issue-lifecycle.md**: no edits — RFC is authoritative
  and already describes this design.

Documentation is part of "done" — code without updated docs is
incomplete.

## Dependencies
- BB-1 (folders raw/todo/done/failed/blocked) and BB-2 (consolidated
  `workflows.yml`) already shipped in master.
- `propagateBlocked` is referenced; this cycle ships a no-op stub. BB-6
  fills in the real walk.
- `failed/` directory must exist; created at init time per BB-1.
- No external services or env vars beyond the existing engine
  requirements (`git`, `gh`, `claude`).
```
