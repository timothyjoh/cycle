---
id: refl-0193-refl-0192-model-thinking-codex-only-open
title: "Update refl-0192 model/thinking ACs: codex and auggie, not codex-only"
workflow: feature
depends_on: []
triaged_at: "2026-05-20T03:16:59.208Z"
source: triage
---
## Context

Cycle 0193 added `auggie` as a first-class agent with identical `model` and `thinking` forwarding to codex (`exec-auggie.ts` maps both fields to `--model`/`--thinking` argv flags via the same `run-cycle.ts` call site). Two pending issues from cycle 0192 have stale acceptance criteria that assume these fields are codex-exclusive:

- `refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields`
- `refl-0192-model-and-thinking-fields-silently-ignor-validate-model-thinking-on-non-codex-step`

If implemented as-written:
- `ARCHITECTURE.md` and `Step` type inline comments will say "codex only" while auggie also consumes these fields.
- `loadConfig` will emit a false-positive warning when `model`/`thinking` is set on an `auggie` step, silencing a legitimate use case.

This issue must be resolved before either of those two issues is picked up.

## Work

### 1. Update `docs/cycle/issues/todo/refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields.md`

- Replace all "codex only" / "codex-only" language with "codex and auggie"
- Update acceptance criteria so that `ARCHITECTURE.md` step field table and `Step` type inline comments read `// codex and auggie` (not `// codex only`)
- Ensure the title and body no longer imply exclusivity to codex

### 2. Update `docs/cycle/issues/todo/refl-0192-model-and-thinking-fields-silently-ignor-validate-model-thinking-on-non-codex-step.md`

- Change the warning condition from "non-codex step" to "step whose agent is not `codex` or `auggie`"
- Update acceptance criteria: `loadConfig` warning triggers only when `model` or `thinking` is set on a step where `agent` is not `codex` and not `auggie`
- Update title if it contains "non-codex" wording to reflect the expanded supported set

## Acceptance Criteria

- [ ] `refl-0192-...-document-codex-only-fields.md` contains no "codex only" / "codex-only" language; names both `codex` and `auggie` as the supported agents for `model`/`thinking`
- [ ] `refl-0192-...-validate-model-thinking-on-non-codex-step.md` warning condition explicitly excludes both `codex` and `auggie` steps (not just codex)
- [ ] No source code changes — this is a todo-file AC correction only
- [ ] Both updated todo files remain coherent markdown with self-consistent acceptance criteria
