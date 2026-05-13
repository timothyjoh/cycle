---
id: re-triage-flag
source: text
title: "re_triage flag: punt a child back to raw/ when further decomposition is needed"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 5
---

## Why

A triaged child in `todo/` may turn out to need further decomposition (e.g., during the cycle's `spec` step the agent realizes the work is bigger than the child suggests). Punt it back to `raw/` with `re_triage: true` so the next triage pass decomposes it further.

## Acceptance
- A step (likely `spec` or `plan`) can write `re_triage: true` to its issue file's frontmatter, abort the cycle, and the engine moves the file todo/ -> raw/ instead of treating it as a failure
- Triage handles `re_triage: true` raw files: re-decomposes them, drops the flag on the new children, original goes to done/_raw as usual
- Prevents infinite re-triage loops (e.g., if a file is re-triaged 3 times in a row, move to failed/ with a reason)
