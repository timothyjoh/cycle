---
id: refl-0030-step-agent-narrow-union-decays-as-regist
source: reflection
title: step-agent-narrow-union-decays-as-registry-grows
added_at: "2026-05-13T22:05:41.159Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0030"
---

`src/engine/workflow.ts:7` still types `Step.agent` as the narrow union `"claudecode" | "bash"`. The runtime dispatcher (`resolveAgent` in `src/engine/exec.ts`) accepts any string, and `loadConfig` force-casts parsed YAML, so a user can write `agent: codex` in `workflows.yml` and it dispatches correctly — but the compile-time type lies. RESEARCH.md, BUILD.md, and REVIEW.md all flagged this in cycle 0030 as a deliberately-punted latent inconsistency.

With `codex` now in the registry and Gemini queued (`multi-agent-abstraction-exec-gemini` is downstream of this cycle), the union is provably stale at two sites and about to be stale at three. Each new provider widens the gap between the type and the truth, and the type's signal value erodes.

Direction: widen `Step.agent` to `string`, or — better — derive it from `keyof typeof REGISTRY` so the type stays accurate without manual edits per provider. Touches `workflow.ts`, possibly `loadConfig`, and one or two tests that pattern-match the union. Single small cycle.
