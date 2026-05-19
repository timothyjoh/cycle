---
id: refl-0188-isdenied-logic-duplicated-verbatim-acros
source: reflection
title: isDenied logic duplicated verbatim across commit-cycle.ts and run-cycle.ts with no shared extraction
added_at: "2026-05-19T18:12:43.980Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0188"
---

`commit-cycle.ts:isDenied` and `run-cycle.ts:isDocAppendDenied` have identical implementations (same prefix list, same exact list, same `.lock` suffix check) with no shared source. If a new prefix or exact path needs to be added to the denylist — e.g., `.cycle/` itself or `package-lock.json` — two callsites must be updated in sync. The divergence will happen silently and be discovered only when `scopeGuard` blocks on a path that `appendDocumentationPaths` let through (or vice versa).

Extract the shared logic into a single `isDenied(p: string): boolean` helper exported from a utility module (e.g., `src/engine/path-utils.ts`) and import it in both `commit-cycle.ts` and `run-cycle.ts`.
