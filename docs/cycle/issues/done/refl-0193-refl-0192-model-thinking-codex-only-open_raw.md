---
id: refl-0193-refl-0192-model-thinking-codex-only-open
source: reflection
title: refl-0192 model/thinking 'codex-only' open issues stale after auggie promotion
added_at: "2026-05-20T03:08:38.750Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0193"
---

Two open issues from cycle 0192 assume `model` and `thinking` are codex-exclusive:

- `refl-0192-model-and-thinking-fields-silently-ignor-document-codex-only-fields` — acceptance criteria say to annotate both fields as "codex only" in `ARCHITECTURE.md` and add `// codex only` inline comments to the `Step` type.
- `refl-0192-model-and-thinking-fields-silently-ignor-validate-model-thinking-on-non-codex-step` — acceptance criteria say to warn at `loadConfig` time when `model` or `thinking` is set on any step whose agent is not `codex`.

Cycle 0193 added auggie with identical model/thinking forwarding. If these issues are implemented as-written, they produce (a) incorrect documentation (`ARCHITECTURE.md` and `Step` type will say "codex only" while auggie also applies), and (b) a false-positive warning when `model`/`thinking` is set on an auggie step, silencing a legitimate use case. Both issues need their acceptance criteria updated to read "codex and auggie" before any implementation begins.
