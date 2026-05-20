---
id: refl-0189-scopeguard-enforces-only-src-and-scripts
source: reflection
title: scopeGuard enforces only src/ and scripts/ — docs and test violations undetected
added_at: "2026-05-20T01:31:29.267Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0189"
---

The `scopeGuard` function at `src/engine/commit-cycle.ts:79` skips any dirty file not prefixed with `src/` or `scripts/`. Files under `docs/`, `tests/`, or project-root config paths are silently ignored. This means an AI agent that writes to `docs/` or `tests/` outside its BUILD.md touched list will never trigger a `scope_violation`.

This was exposed in cycle 0189: four pre-existing `commit-cycle.test.ts` tests used `README.md` as the dirty file to trigger scope_violation. They were changed to `src/bar.ts` because the implementation doesn't actually block README.md. The tests now correctly reflect the implementation, but the implementation's narrower-than-intended coverage is unaddressed.

Suggested direction: audit whether the intended semantics are "only src/ and scripts/ are guarded" (document it explicitly) or "any file outside the touched list is guarded" (fix the filter). Either decision should be locked in with a test that explicitly asserts the boundary.
