---
id: refl-0187-scopeguard-blocks-documentation-step-fil
source: reflection
title: scopeGuard blocks documentation-step file modifications not declared in BUILD.md Touched Files
added_at: "2026-05-19T17:20:59.927Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0187"
---

The `scopeGuard` in `src/engine/commit-cycle.ts:47–79` rejects any staged or modified file not listed under `## Touched Files` in `BUILD.md`. The documentation step (step 8) runs before commit and modifies `README.md` and `docs/ARCHITECTURE.md`, but BUILD.md is written during the build step (step 4) and only lists source/test files. These documentation-step files are therefore never in the touched set.

This is the confirmed root cause of cycle 0187's first commit failure (obs 2289). The second attempt (now at reflection) has the same unresolved blockers in the working tree: `README.md` and `docs/ARCHITECTURE.md` are still modified and still absent from BUILD.md's Touched Files section.

Fix direction: either (a) have `run-cycle.ts` auto-append paths written by the documentation step into BUILD.md's Touched Files section after that step completes, or (b) add a documentation-step allowlist to `scopeGuard` (e.g. skip paths matching `README.md` and `docs/` when a documentation step exists in the workflow), or (c) have the documentation step prompt instruct the agent to append its output paths to BUILD.md. Option (a) is most robust: the engine owns both the step execution and BUILD.md.
