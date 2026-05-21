---
id: refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip
title: Extend triage repair logic to strip markdown fence wrappers before parse
workflow: feature
depends_on: [refl-0202-triage-agent-emits-markdown-fenced-json-prompt-fix]
triaged_at: "2026-05-21T04:55:25.342Z"
source: triage
parent: refl-0202-triage-agent-emits-markdown-fenced-json
failed_at: "2026-05-21T07:30:39.149Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0210"
---
## Problem

When the triage agent wraps output in markdown fences, the current one-shot repair pass does not strip them. A fence-wrapped response that would parse cleanly after stripping instead burns the retry budget and may exhaust all three attempts. The redesign-06 issue was stranded in raw/ because all three retries were consumed this way.

The existing repair logic strips trailing prose but does not strip leading or trailing fence delimiters from the entire output.

## Fix

Extend the engine JSON parse/repair logic to detect and strip a leading triple-backtick fence opener (with optional json language tag) and a trailing triple-backtick fence closer before the JSON.parse() attempt.

This converts fence-wrapped outputs into soft-recovered successes without consuming a retry, and handles the redesign-06 class of failure permanently.

## Location

Triage output parse and repair logic in `src/engine/triage.ts` or `src/engine/run-cycle.ts` -- wherever the one-shot repair pass currently strips trailing prose.

## Verification

- Add a unit test: triage output wrapped in a triple-backtick json fence parses successfully after repair without consuming a retry.
- `npm test` -- all tests pass.
- `npm run typecheck` -- no errors.
- `npm run test:coverage` -- coverage floors maintained.
