---
id: refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields
title: Annotate model and thinking step fields as codex-only in ARCHITECTURE.md and Step type
workflow: feature
depends_on: []
triaged_at: "2026-05-20T02:50:20.632Z"
source: triage
parent: refl-0192-model-and-thinking-fields-silently-ignor
---
## Problem

`Step.model` and `Step.thinking` are declared at the top-level `Step` type with no agent restriction. A workflow author who writes `model: claude-opus` on a `claudecode` or `gemini` step gets no error, no warning, and no effect — the fields are silently dropped by every exec module except `exec-codex`.

## Acceptance Criteria

- `ARCHITECTURE.md` step-field table rows for `model` and `thinking` carry a "codex only" annotation.
- The `Step` type definition in `src/` has an inline comment on both fields marking them as codex-specific (e.g. `// codex only`).
- `CLAUDE.md` architecture bullet for registered agents is updated if it describes `model`/`thinking` without a scope qualifier.
- No runtime behavior change — documentation only.

## Notes

Origin: cycle 0192 reflection, priority_hint 5. This is the minimal fix; the runtime validation guard is a separate follow-on child.
