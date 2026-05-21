---
id: refl-0205-triage-parse-path-has-no-code-side-fence
source: reflection
title: triage parse path has no code-side fence-stripping; prompt-only defense is probabilistic
added_at: "2026-05-21T05:39:04.747Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0205"
---

`src/engine/triage.ts:394` does a bare `JSON.parse(rawStdout)` with no pre-processing. The prompt instruction added in cycle 0205 reduces fence-wrapping frequency, but the model will still occasionally ignore it — prior data showed a 10% parse failure rate with 76% of failures caused by fence wrapping. A deterministic code-side strip (remove leading ` ```json ` / ` ``` ` wrappers before parsing) would eliminate this failure class entirely at near-zero cost. The prompt instruction and the code-side strip are complementary: the instruction is the first line of defense; the strip is the safe fallback so the retry budget is not burned on a trivially recoverable error.

Suggested direction: add a `stripFences(s: string): string` helper in `triage.ts` (or `log-fmt.ts`) that removes a leading code-fence block marker and trailing closer before calling `JSON.parse`. Apply it unconditionally before validation in `validateTriageOutput`.
