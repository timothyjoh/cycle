---
id: refl-0188-isdenied-logic-duplicated-verbatim-acros
title: Extract shared isDenied denylist helper into src/engine/path-utils.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-19T18:16:48.723Z"
source: triage
---
## Problem

`commit-cycle.ts:isDenied` and `run-cycle.ts:isDocAppendDenied` share identical denylist logic — same prefix list (`.cycle/`, `dist/`, `node_modules/`), same exact-match set (`.cycle/cycle.pid`), and same `.lock` suffix check — but are defined independently in two files with no shared source. Any denylist update (e.g. adding `package-lock.json` or a new prefix) must be applied to both callsites manually and will silently diverge if missed. The divergence surfaces only when `scopeGuard` blocks on a path that `appendDocumentationPaths` allowed through, or vice versa.

## Fix

Create `src/engine/path-utils.ts` exporting a single `isDenied(p: string): boolean` helper. Import it in both `src/engine/commit-cycle.ts` (replacing the local `isDenied`) and `src/engine/run-cycle.ts` (replacing `isDocAppendDenied`). Delete both local implementations.

## Acceptance Criteria

- [ ] `src/engine/path-utils.ts` exists and exports `isDenied(p: string): boolean` with the unified prefix list, exact-match set, and `.lock` suffix check
- [ ] `commit-cycle.ts` imports and uses `isDenied` from `path-utils.ts`; local `isDenied` definition removed
- [ ] `run-cycle.ts` imports and uses `isDenied` from `path-utils.ts`; local `isDocAppendDenied` definition and all call sites updated
- [ ] No local denylist implementations remain in either file
- [ ] All existing scope-guard and documentation-path-filter tests pass unchanged
- [ ] `src/engine/path-utils.ts` has its own unit tests covering prefix match, exact match, and `.lock` suffix check
- [ ] `npm run typecheck` passes with no new errors
- [ ] Coverage does not drop (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
