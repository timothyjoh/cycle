---
id: refl-0192-model-and-thinking-fields-silently-ignor
source: reflection
title: model and thinking fields silently ignored on non-codex agents
added_at: "2026-05-20T02:43:45.409Z"
triage_attempts: 1
priority_hint: 5
origin_cycle_id: "0192"
---

`Step.model` and `Step.thinking` are defined at the top-level `Step` type with no agent restriction. A workflow author who writes `model: claude-opus` on a `claudecode` step will get no error, no warning, and no effect — the fields are destructured and dropped by every exec module except codex.

At minimum, ARCHITECTURE.md and the step-field docstring should note "codex only" next to these rows. A stronger fix would add a validation warning in `loadConfig` when `model` or `thinking` is set on a non-codex step. Without this, silent misconfiguration is the likely failure mode as more agents are added.
