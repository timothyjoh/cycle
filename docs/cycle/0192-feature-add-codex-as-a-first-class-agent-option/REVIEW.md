**NEEDS-FIX. Two issues:**

**Task 1 (Critical)** — PLAN.md has no `## SPEC Acceptance Traceability` section. 12 acceptance criteria in SPEC.md, zero traced to plan tasks.

**Task 2 (Minor)** — `CLAUDE.md:59` (new line) calls `bash` a "registered step agent" alongside `claudecode`, `codex`, `gemini`. But `bash` has no entry in `REGISTRY` (`exec.ts:24-28`) — it's dispatched directly via `execBashStep` at `run-cycle.ts:283`. The word "registered" is wrong for bash.

Everything else is clean: 535/535 pass, Line 98.55% / Branch 91.71% / Function 93.18%, typecheck clean, all 12 SPEC acceptance criteria implemented, all doc claims backed except the `bash` one above.
