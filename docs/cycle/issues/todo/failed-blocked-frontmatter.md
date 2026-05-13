---
id: failed-blocked-frontmatter
title: Add structured frontmatter to failed/ and blocked/ file moves
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:13:29.789Z"
source: triage
---
## Why

When a cycle's issue file is moved to `failed/` or `blocked/`, the engine should stamp structured frontmatter so humans and future agents can reason about the state without grepping `log.jsonl` or guessing cycle ids.

Current state (per `CLAUDE.md`):
- `src/engine/queue.ts` already stamps `failed_at`, `failed_step`, `failed_attempts` on terminal-failure moves to `failed/`.
- `src/engine/blocked.ts:propagateBlocked` already stamps `blocked_at` and `blocked_by:[<immediate predecessor(s)>]` on moves to `blocked/`.

Gap: failed-file frontmatter is missing `last_cycle_id` — the cross-reference into `.cycle/log.jsonl` and the per-cycle artifact dir. Without it, humans inspecting a `failed/<id>.md` file have to scan the log to find which cycle attempt produced the failure.

## Acceptance

### Failed move (`todo/ → failed/`, terminal failure path in `src/engine/queue.ts`)

Frontmatter additions, all four required:
- `failed_at: <ISO timestamp>` (already implemented — verify)
- `failed_step: <step name>` last step that failed (already implemented — verify)
- `failed_attempts: <N>` typically 3 (already implemented — verify)
- `last_cycle_id: <cycle_id>` **NEW** — the cycle id of the terminal-failure attempt; matches `.cycle/log.jsonl` `cycle.start.cycle_id` and the cycle's artifact dir name

### Blocked move (`todo/ → blocked/`, in `src/engine/blocked.ts:propagateBlocked`)

Frontmatter, both required (both already implemented — verify):
- `blocked_at: <ISO timestamp>`
- `blocked_by: [<failed_id>, ...]` immediate predecessor(s); transitive chain reconstructable from history

### Tests

- Failed-move test asserts all four frontmatter fields on the resulting `failed/<id>.md`, including `last_cycle_id` matches the failing cycle id from the test fixture.
- Blocked-move test asserts both fields on `blocked/<id>.md`, including the `blocked_by` chain for a 2+ hop dependency graph.
- Coverage must not regress vs the master baseline (line ≥95%, branch ≥75%, function ≥90%).

## Notes

- Plumb `cycle_id` into the failure path of `queue.ts` if it isn't already in scope at the move site; `run-cycle.ts` knows the active cycle id when it calls into the queue drain.
- Use `parseFrontmatter` / `serializeFrontmatter` helpers in `src/engine/frontmatter.ts` for consistency; do not hand-roll YAML.
