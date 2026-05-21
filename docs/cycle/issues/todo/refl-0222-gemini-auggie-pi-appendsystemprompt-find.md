---
id: refl-0222-gemini-auggie-pi-appendsystemprompt-find
title: Add recheck hints to ENGINE.md and JSDoc for gemini/auggie/pi appendSystemPrompt unknown entries
workflow: feature
depends_on: []
triaged_at: "2026-05-21T12:21:14.845Z"
source: triage
---
## Context

Cycle 0222 completed a systematic CLI research pass to determine per-agent `appendSystemPrompt` support status for all five non-claudecode agents. `codex` and `opencode` are definitively confirmed as not supported. `gemini`, `auggie`, and `pi` are marked "unknown — CLI not installed / unstable in dev environment."

`ENGINE.md` Known Limitations currently says "unknown entries will be updated as CLIs stabilise" but no queue entry or in-code marker exists to prompt a future triage pass. Without an active reminder these three entries will silently age indefinitely.

## Goal

Add explicit `recheck` callouts to the `ENGINE.md` entries for `gemini`, `auggie`, and `pi` so that when any of those CLIs become available in the dev environment a future maintainer (or triage pass) knows exactly what to do. Also update the JSDoc block in `src/engine/exec.ts` (`ExecModule.runStep`) to carry the same "revisit when CLI stabilises" annotation.

## Acceptance Criteria

- `ENGINE.md` known-limitations entries for `gemini`, `auggie`, and `pi` each include a `> **Recheck:** When `<binary>` is available in the dev environment, run `<binary> --help` and look for a flag equivalent to `--append-system-prompt`. Update this entry and the JSDoc in `src/engine/exec.ts` with the confirmed finding.` callout (or equivalent prose).
- The JSDoc block added in cycle 0222 to `ExecModule.runStep` in `src/engine/exec.ts` is updated for `gemini`, `auggie`, and `pi` entries to note `// TODO: recheck when CLI stabilises — run '<binary> --help' for system-prompt-append equivalent`.
- No functional code changes — documentation only.
- `npm test` passes with no regressions.

## Notes

- Do not invent support status; the correct update is to mark the recheck obligation, not to guess the answer.
- If any of the three CLIs happen to be available at implementation time, run the help check and record the real finding instead of a placeholder.
- Priority: low (priority_hint 5). Safe to defer until higher-priority queue items drain.
