---
id: refl-0019-tsconfig-es2023-bump-needs-formal-decisi
source: reflection
title: tsconfig-es2023-bump-needs-formal-decision
added_at: "2026-05-13T18:32:16.060Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0019"
---

Cycle 0019 quietly bumped `tsconfig.json` `target: ES2022 → ES2023` and added `lib: ["ES2023"]` to clear pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`. BUILD.md and REVIEW.md both flag this as out-of-scope-but-necessary scope creep. The change is now sitting on master without any project-level acknowledgement: CLAUDE.md still says only "Node ≥ 22.6", there is no note that the codebase now relies on ES2023 lib, and no ADR / RFC documents the floor.

Future cycles will hit the same `findLast` / similar lib-version issue and re-litigate the decision. A small follow-up should: (a) add a one-line note to CLAUDE.md ("TS target/lib: ES2023; assumes Node ≥ 22.6 at runtime"); (b) move the `findLast` fix into a deliberate issue rather than a hidden side-effect of a one-line cycle.
