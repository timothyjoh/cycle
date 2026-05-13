---
id: refl-0019-tsconfig-es2023-bump-needs-formal-decisi
title: Document ES2023 tsconfig floor (target/lib) in CLAUDE.md + ADR
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:34:16.776Z"
source: triage
---
## Background

Cycle 0019 quietly bumped `tsconfig.json` from `target: ES2022` → `target: ES2023` and added `lib: ["ES2023"]` to clear pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`. The change landed on master but was flagged in BUILD.md and REVIEW.md as out-of-scope scope creep that should have been its own issue.

No project-level acknowledgement exists:
- CLAUDE.md still says only "Node ≥ 22.6" under Runtime.
- No ADR / RFC documents why the TypeScript floor is now ES2023.
- The next cycle that hits a similar lib-version question (e.g. `Array.prototype.toSorted`, `Object.groupBy`) will re-litigate the decision from scratch.

## Scope

This is a documentation-only follow-up. The code change is already on master; nothing in `src/` should move.

### Acceptance criteria

1. **CLAUDE.md — Runtime section**
   - Add a one-line note immediately under the existing `Node ≥ 22.6` bullet:
     > TypeScript `target` / `lib`: ES2023. Assumes Node ≥ 22.6 at runtime (Node 22 ships V8 with full ES2023 support, including `Array.prototype.findLast` / `findLastIndex`).
   - The phrasing must make it explicit that ES2023 is the *floor*, not an aspirational target, so future contributors know they can rely on `findLast`, `toSorted`, `toReversed`, `with`, `Hashbang grammar`, etc.

2. **ADR (or RFC) — capture the decision**
   - Add a new short ADR under `docs/adr/` (or extend RFC-001 if the project prefers RFCs for this class of decision — check existing convention first by listing `docs/` and `docs/adr/`).
   - Required sections: Context (cycle 0019 hit `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`), Decision (bump `tsconfig.json` `target` + `lib` to `ES2023`), Consequences (Node 22.6 runtime floor is now load-bearing for type-checking, not just runtime; downgrading the lib floor requires either a Node downgrade or a polyfill).
   - Link from CLAUDE.md's new line to the ADR/RFC so the rationale is one click away.

3. **Backfilled "deliberate issue" trail**
   - Reference cycle 0019's BUILD.md and REVIEW.md in the ADR/RFC so the historical "scope creep" framing is recorded as the trigger.
   - No need to re-open or re-do the `findLast` fix — it is on master. The point of this item is purely to retroactively turn a hidden side-effect into a documented decision so the same conversation does not happen again next time someone reaches for an ES2023 array method.

### Non-goals

- No changes to `tsconfig.json`. The current `target: ES2023` / `lib: ["ES2023"]` stays.
- No changes to `src/`, `tests/`, or `dist/`.
- Not adding a CI check that pins the floor — that can be a separate issue if desired.

## Why this is worth doing

The reflection from cycle 0019 (priority_hint 6) noted that the change is now "sitting on master without any project-level acknowledgement." Documentation rot is cheap to prevent now and expensive to untangle later when somebody opens a PR that downgrades the lib to fix an unrelated tooling bug and breaks `findLast` calls silently.
