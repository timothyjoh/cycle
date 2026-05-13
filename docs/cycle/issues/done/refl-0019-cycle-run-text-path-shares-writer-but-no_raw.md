---
id: refl-0019-cycle-run-text-path-shares-writer-but-no
source: reflection
title: cycle-run-text-path-shares-writer-but-no-test-pins-frontmatter
added_at: "2026-05-13T18:32:16.060Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0019"
---

`src/cli.ts:62-64` (the `cycle run "<text>"` convenience path) routes through the same `materializeFreeformIssue` and now also emits `priority: 3`. RESEARCH.md, PLAN.md, and REVIEW.md all flag this as expected shared-writer fallout, but no unit or e2e test pins the byte shape on that path. The unit test in `tests/issue/materialize.test.ts` covers the function; `tests/cli/multi-loop.test.ts:123` only exercises the `drop` branch end-to-end.

Low-risk: triage ignores `priority` today and the writer is shared. But if anyone ever splits the call sites (e.g. wires `--priority` into `drop` only), the `run "<text>"` path will silently drift. Add a one-line e2e assertion mirroring the drop test, or — cheaper — collapse the two CLI branches into a single helper so they cannot diverge.
