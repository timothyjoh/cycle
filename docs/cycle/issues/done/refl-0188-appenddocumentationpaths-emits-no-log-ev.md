---
id: refl-0188-appenddocumentationpaths-emits-no-log-ev
title: "appendDocumentationPaths: emit documentation.paths_appended log event after write"
workflow: feature
depends_on: []
triaged_at: "2026-05-19T18:13:43.059Z"
source: triage
---
## Problem

`appendDocumentationPaths` in `src/engine/run-cycle.ts` silently mutates `BUILD.md` with no corresponding `log.emit` call. When `scopeGuard` subsequently blocks a commit (e.g., a path excluded by the denylist or missed for another reason), there is no audit trail showing what was auto-appended vs. what the build agent declared. Post-mortem debugging is blind.

## Acceptance Criteria

1. After the `writeFile` call in `appendDocumentationPaths`, emit a structured log event:
   - Event name: `documentation.paths_appended`
   - Payload: `{ cycle_id: string, appended: string[] }`
2. Fast-path: when `toAppend.length === 0`, do **not** emit — a no-op append produces no event.
3. Pattern mirrors `reflection.surfaced` — same log level, same payload shape convention.
4. Event appears in engine event stream and is verifiable in tests.
5. Existing tests pass; add a test asserting the event fires with the correct `appended` array when paths are written, and does not fire when `toAppend` is empty.

## Implementation Notes

- Locate `appendDocumentationPaths` in `src/engine/run-cycle.ts`.
- Use the existing `log` reference already in scope within `run-cycle.ts`.
- Emit immediately after the successful `writeFile` call, not before (avoids false-positive events on I/O error).
- Event is informational only — the append already succeeded at this point, no rollback semantics needed.
- Ensure the event type is added to the engine's event union type if one exists, so TypeScript does not reject the emit call.

## References

- Origin cycle: 0188
- Pattern reference: `reflection.surfaced` event in `src/engine/run-cycle.ts`
- Related: `refl-0187-scopeguard-blocks-documentation-step-fil` (the cycle that shipped `appendDocumentationPaths`)
