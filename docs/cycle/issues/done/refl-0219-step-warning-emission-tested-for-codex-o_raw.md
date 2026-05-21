---
id: refl-0219-step-warning-emission-tested-for-codex-o
source: reflection
title: step.warning emission tested for codex only; four non-claudecode agents have no regression coverage
added_at: "2026-05-21T11:08:41.968Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0219"
---

The new test in `tests/engine/run-cycle.append-system-prompt-warning.test.ts` verifies the `step.warning` event fires for `codex` but not for `gemini`, `auggie`, `opencode`, or `pi`. The production guard is generic (`step.agent !== "claudecode"`), so all five should fire, but a future refactor that introduces agent-specific branching or renames an agent constant could silently break the warning for the untested four.

A parametrized test or four additional narrow assertions (each placing one of the remaining agents on a build step) would pin the cardinality contract for all non-claudecode agents and prevent silent regressions.
