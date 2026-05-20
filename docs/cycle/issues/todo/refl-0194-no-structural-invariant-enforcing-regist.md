---
id: refl-0194-no-structural-invariant-enforcing-regist
title: Add structural invariant enforcing REGISTRY / Step.agent union / exec-file count consistency
workflow: feature
depends_on: [refl-0192-gemini-agent-registered-in-registry-but]
triaged_at: "2026-05-20T03:38:38.515Z"
source: triage
---
## Context

The agent fleet has five entries: `claudecode`, `codex`, `gemini`, `auggie`, `opencode`. All three components must stay in sync:

1. An `exec-<agent>.ts` file in `src/engine/`
2. A `REGISTRY` entry in `src/engine/exec.ts`
3. A string literal `"<agent>"` in the `Step.agent` union in `src/engine/workflow.ts`

No build-time check enforces this. A partial registration compiles cleanly and only fails at runtime when a workflow step with that agent executes. Cycle 0192 discovered this gap for `gemini` (in REGISTRY but absent from `Step.agent` union). CLAUDE.md already documents the gap: _"Agent fleet consistency (REGISTRY in exec.ts, Step.agent union in workflow.ts, and exec-*.ts files) is not yet covered by a structural invariant."_

This item depends on `refl-0192-gemini-agent-registered-in-registry-but` landing first so the fleet is consistent at 5 agents before the invariant is installed (otherwise the invariant would immediately fail on the existing gemini inconsistency).

## Acceptance Criteria

- [ ] Add an invariant to the `INVARIANTS` table in `scripts/structural-invariants.mjs` that:
  - Counts agent entries registered in `REGISTRY` in `src/engine/exec.ts`
  - Counts registry-backed string literals in the `Step.agent` union in `src/engine/workflow.ts` (exclude `"bash"` — it is dispatched via `execBashStep`, not through REGISTRY)
  - Counts `exec-<agent>.ts` files in `src/engine/` (exclude `exec.ts` itself and `exec-bash.ts` if present, matching the same registry-backed set)
  - Asserts all three counts are equal and ≥ 1, emitting a descriptive error that names each count when they diverge
- [ ] `npm run check:invariants` passes with the fleet at 5 consistent agents
- [ ] CLAUDE.md updated: remove the _"not yet covered by a structural invariant"_ caveat from the agent fleet note

## Notes

- Count equality is the target; name-alignment verification (asserting the string values match across all three sources) is a worthwhile follow-up but out of scope here
- Follow existing `INVARIANTS` table patterns in `scripts/structural-invariants.mjs` for structure and error formatting
- The `bash` exclusion is load-bearing: `bash` may appear in the `Step.agent` union but is not in REGISTRY and has no `exec-bash.ts` peer; including it would make the counts structurally mismatched by design
