---
id: refl-0019-cycle-run-text-path-shares-writer-but-no
title: "Pin frontmatter byte-shape on `cycle run \"<text>\"` path (or collapse with `drop`)"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:33:05.169Z"
source: triage
---
## Problem

`src/cli.ts:62-64` (the `cycle run "<text>"` convenience path) routes through the same `materializeFreeformIssue` as `cycle drop`, and now emits `priority: 3` in raw/ frontmatter. The unit test in `tests/issue/materialize.test.ts` covers the writer function, and `tests/cli/multi-loop.test.ts:123` exercises the `drop` branch end-to-end — but no test pins the byte-level frontmatter shape on the `run "<text>"` path.

Low-risk today: triage ignores `priority`, the writer is shared, and RESEARCH.md / PLAN.md / REVIEW.md from cycle 0019 all flag this as expected shared-writer fallout. The hazard is future drift: if anyone wires a `drop`-only flag (e.g. `--priority N` from sibling issue `refl-0019-cycle-drop-priority-flag-deferred-no-fol`) by splitting the two call sites, the `run "<text>"` path will silently diverge with no test catching it.

## Acceptance criteria

Pick ONE of the two below — both are acceptable; pick whichever is cleaner after reading `src/cli.ts:62-64` and the `drop` branch alongside it.

### Option A — pin with an e2e assertion (cheaper, defensive)

- Add an e2e test in `tests/cli/multi-loop.test.ts` (or a sibling file) that runs `cycle run "<some text>"` against a temp repo and asserts the resulting `raw/<id>.md` frontmatter contains `priority: 3` (and any other fields `drop`'s test pins). Mirror the existing `drop`-branch assertion at `tests/cli/multi-loop.test.ts:123` as closely as possible so the two tests stay in lockstep.
- Test must fail if `materializeFreeformIssue` is bypassed or the `priority` default is changed on only one path.

### Option B — collapse the two CLI branches (preferred if call sites are near-identical)

- Extract the shared body of the `cycle drop <text>` and `cycle run "<text>"` branches in `src/cli.ts` into a single helper (e.g. `materializeAndQueueFreeform(text, opts)`) that both branches call. After the refactor, the two CLI subcommands differ only in argument parsing and whether they then proceed to start the engine.
- The existing unit test for `materializeFreeformIssue` plus the existing `drop`-branch e2e test then transitively cover both entry points, because there is only one code path to test.
- Do NOT add a `--priority` flag in this issue — that work is tracked separately as `refl-0019-cycle-drop-priority-flag-deferred-no-fol`. Just remove the duplication.

## Out of scope

- Implementing `--priority N` on `drop` or `run` (separate issue).
- Changing the default `priority: 3` value.
- Changing triage's behavior toward the `priority` field.

## References

- `src/cli.ts:62-64` — the `cycle run "<text>"` convenience path
- `tests/issue/materialize.test.ts` — unit test for the shared writer
- `tests/cli/multi-loop.test.ts:123` — existing e2e assertion on the `drop` path
- Surfaced by the reflection step on cycle 0019 (`origin_cycle_id: 0019`, `priority_hint: 2`).
