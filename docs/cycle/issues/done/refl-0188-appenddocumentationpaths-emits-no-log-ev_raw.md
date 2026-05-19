---
id: refl-0188-appenddocumentationpaths-emits-no-log-ev
source: reflection
title: appendDocumentationPaths emits no log event — no audit trail for auto-appended paths
added_at: "2026-05-19T18:12:43.980Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0188"
---

After `appendDocumentationPaths` runs in `run-cycle.ts` it silently mutates BUILD.md with no corresponding `log.emit` call. If `scopeGuard` still blocks on the subsequent commit (e.g., because a path was excluded by the denylist or missed for another reason), there is no log entry to show what was auto-appended vs. what was declared by the build agent. This makes post-mortem debugging blind.

The fix is straightforward: emit a structured event — e.g., `documentation.paths_appended` with `{ cycle_id, appended: string[] }` — immediately after the `writeFile` call, mirroring the pattern used by `reflection.surfaced`. An empty-append fast-path (when `toAppend.length === 0`) should not emit.
