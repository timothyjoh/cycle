# SPEC — Cycle 0025: Stamp `last_cycle_id` on terminal-failure moves

## Objective

Make `failed/<id>.md` self-describing by stamping the failing cycle's id into frontmatter at the moment `queue.ts` moves the file from `todo/` to `failed/`. A human (or future agent) opening a failed issue file should be able to jump straight to `.cycle/log.jsonl` and `docs/cycle/<cycle_id>-<workflow>-<slug>/` without grepping for which attempt produced the failure.

## Source Issue

`failed-blocked-frontmatter` — "Add structured frontmatter to failed/ and blocked/ file moves"

## Scope

### In Scope

- Plumb the active `cycle_id` into the terminal-failure path of `src/engine/queue.ts` and stamp `last_cycle_id: <cycle_id>` alongside the existing `failed_at` / `failed_step` / `failed_attempts` fields when a todo file moves to `failed/`.
- Verification (no behavior change expected) that `failed_at`, `failed_step`, `failed_attempts` are already stamped, and that `blocked_at` + `blocked_by` are already stamped on `propagateBlocked` moves.
- Tests covering the new field on failed moves and a regression test covering `blocked_by` on a 2+ hop dependency graph.

### Out of Scope

- Any change to `blocked/` move frontmatter — `blocked_at` and `blocked_by` are already correct per the issue.
- New event shapes in `log.jsonl`.
- Re-stamping existing `failed/*.md` files in-tree (no migration / backfill).
- Adding `last_cycle_id` to anywhere other than the terminal-failure move.

## Requirements

- `src/engine/queue.ts` writes `last_cycle_id: <cycle_id>` into the frontmatter of `failed/<id>.md` during the terminal-failure branch (`attempt >= max_cycle_attempts`).
- `cycle_id` reaches `queue.ts` via the existing drain call site in `src/engine/run-cycle.ts` (or wherever the queue drain is invoked); no new globals.
- Frontmatter mutation uses `parseFrontmatter` / `serializeFrontmatter` from `src/engine/frontmatter.ts`. No hand-rolled YAML.
- `last_cycle_id` value equals the `cycle_id` emitted in the matching `cycle.start` log event and the artifact directory name segment.
- Coverage must not regress against the master baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90%.

## Acceptance Criteria

- [ ] On terminal failure, `failed/<id>.md` contains all four fields: `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`.
- [ ] `last_cycle_id` matches the cycle id from the failing `cycle.start` event in the fixture.
- [ ] On `propagateBlocked`, `blocked/<id>.md` contains `blocked_at` and a correct immediate-predecessor `blocked_by: [...]` for a 2+ hop dependency graph.
- [ ] Existing fields (`failed_at`, `failed_step`, `failed_attempts`, `blocked_at`, `blocked_by`) are preserved with current semantics.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes (no new warnings).
- [ ] `npm run test:coverage` meets the baseline above; report numbers in `BUILD.md` / `FIX.md`.

## Testing Strategy

- Node native test runner (existing `tests/engine/queue.test.ts` and `tests/engine/blocked.test.ts` style).
- **Failed-move test**: drive `queue.ts` through a fixture where a todo issue exhausts `max_cycle_attempts`, then read the resulting `failed/<id>.md` and assert all four frontmatter fields, with `last_cycle_id` equal to the cycle id passed into the drain call.
- **Blocked-move regression test**: build a 3-node dependency chain `A ← B ← C` (or `A ← {B, C}`), fail `A`, run `propagateBlocked`, assert `blocked/B.md` has `blocked_by: [A]` and `blocked/C.md` has `blocked_by: [B]` (immediate predecessor only).
- **Frontmatter helper coverage**: confirm `serializeFrontmatter` round-trips `last_cycle_id` correctly (string, not coerced).
- No new UI surface — no Playwright/E2E.

## Documentation Updates

- **CLAUDE.md**: update the "Architecture quick reference" entry for `queue.ts` to list `last_cycle_id` alongside `failed_at` / `failed_step` / `failed_attempts` in the terminal-failure stamp.
- **RFC-001 (`docs/RFC-001-issue-lifecycle.md`)**: if the failed-frontmatter schema is enumerated there, add `last_cycle_id` to that table.
- **README.md**: no change — this isn't user-facing CLI surface; the existing "Recovering from engine.paused" flow doesn't reference failed-file frontmatter shape.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `src/engine/frontmatter.ts` `parseFrontmatter` / `serializeFrontmatter` (already present).
- `src/engine/queue.ts` terminal-failure path (already present, missing only `last_cycle_id`).
- Active `cycle_id` available at the drain call site in `src/engine/run-cycle.ts` (already known there per CLAUDE.md: "run-cycle.ts knows the active cycle id when it calls into the queue drain").
- No new external services, env vars, or packages.
