---
id: refl-0227-parsetouchedfiles-is-orphaned-in-commit
source: reflection
title: parseTouchedFiles is orphaned in commit-cycle.ts after scopeGuard removal
added_at: "2026-05-21T14:40:57.128Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0227"
---

`src/engine/commit-cycle.ts:15` exports `parseTouchedFiles(buildMdPath)` which reads the `## Touched Files` YAML block from a BUILD.md. After `scopeGuard` was deleted this cycle, `parseTouchedFiles` has no production caller — only three tests in `tests/engine/commit-cycle.test.ts:424–463` exercise it directly.

The function reads the old agent-authored BUILD.md mechanism, which is now superseded by engine-owned `touched.json`. Keeping it exported creates a maintenance trap: future maintainers will see an exported async function with dedicated tests and assume it is load-bearing. It will also silently diverge from the actual footprint mechanism as `touched.json` evolves.

Suggested fix: delete `parseTouchedFiles` and its three unit tests. If preserving BUILD.md parsing is useful (e.g., for migration diagnostics), move it to a separate utility module with a comment explaining its non-production status.
