---
id: refl-0192-model-and-thinking-fields-silently-ignor-validate-model-thinking-on-non-codex-step
title: Warn at loadConfig time when model or thinking is set on a non-codex step
workflow: feature
depends_on: [refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields]
triaged_at: "2026-05-20T02:50:20.632Z"
source: triage
parent: refl-0192-model-and-thinking-fields-silently-ignor
---
## Problem

After the documentation annotation lands, the contract is explicit but still unenforced at runtime. A workflow author who misconfigures `model` or `thinking` on a `claudecode`/`gemini`/`bash` step will still get silent no-op behavior.

## Acceptance Criteria

- `loadConfig` (or equivalent config-validation path) emits a warning — not a hard error — when `model` or `thinking` is set on a step whose `agent` is not `codex`.
- Warning message names the step, the offending field(s), and the expected agent restriction (e.g. `"step 'research': model field is codex-only and will be ignored"`).
- Warning is surfaced to the user via the existing log/event system (not swallowed).
- Unit test covers: warning fires for `claudecode` step with `model` set; no warning for `codex` step with `model` set; no warning for step with neither field.
- `bash` steps (dispatched via `execBashStep`, not the agent registry) are also covered — `model`/`thinking` on a bash step should warn.

## Notes

Origin: cycle 0192 reflection, priority_hint 5. Depends on the documentation child to establish the stated contract before enforcement is added.
