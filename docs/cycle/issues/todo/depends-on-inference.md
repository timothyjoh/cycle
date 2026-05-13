---
id: depends-on-inference
title: Improve triage's depends_on inference quality
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:12:05.307Z"
source: triage
---
## Why

First pass of triage (BB-4) honors explicit `depends_on:` hints from a raw's frontmatter but does not lean on the triage agent's own judgment when decomposing a raw into N children. The agent knows the work best at that moment — when it splits a raw into siblings, it should infer ordering constraints between them (e.g., "add 2FA flow depends on fix login cookie") and emit those as `depends_on` arrays on the children.

Without this, downstream consumers (queue popping, `propagateBlocked`, ordering heuristics) treat sibling children as independent even when they aren't, and the human is left to hand-edit `tbd.jsonl` or `todo/*.md` frontmatter to wire the chain.

## Scope

1. **Prompt update** — `src/defaults/prompts/triage.md` (and the synced `.cycle/` copy via `npm run sync-defaults`):
   - Add an explicit instruction in the "Rules of thumb" / output contract section telling the agent: when decomposing one raw into multiple children, identify sequential or causal dependencies between siblings and emit them in each child's `depends_on` array.
   - Add a worked few-shot example showing dependency inference across siblings (e.g., a raw about "add login" decomposing into `auth-middleware` (no deps) → `login-form` (depends on `auth-middleware`) → `2fa-flow` (depends on `login-form`)).
   - Clarify the existing rule that `depends_on` ids must reference either another child in the same triage output or an existing queue id — never a non-existent or invented id.

2. **Engine validation** — `src/engine/triage.ts`:
   - Extend the JSON-schema / structural validator that already runs after each agent call so that for every child in `children[]`, every entry in its `depends_on` array must resolve to either (a) another child's `id` in the same output, or (b) a current `tbd.jsonl` row id, or (c) a file already in `todo/`. Anything else is a hard validation failure and feeds back into the per-raw retry loop (up to 3 attempts) with a clear error message naming the offending id.

3. **Tests** — `tests/engine/triage.test.ts` (or a sibling file):
   - Snapshot/regression: a raw that obviously needs sequential children (e.g., "add login" → middleware then form) produces children with `depends_on` chained properly. Stub the agent subprocess and assert the validator accepts the output.
   - Negative path: a child references a `depends_on` id that exists in neither the same output nor the queue/`todo/` listing. Assert the validator rejects the output and the retry mechanism re-prompts the agent with the validator's error message.
   - Negative path: a child references its own id in `depends_on` (self-loop). Assert rejection.
   - Coverage for these new branches must keep the line/branch/function thresholds at or above the master baseline (≥95% line, ≥75% branch, ≥90% function).

## Acceptance

- `triage.md` instructs the agent to infer sibling dependencies on decomposition and includes a few-shot example showing it.
- Engine validator rejects `depends_on` ids that don't resolve to another child, a current queue row, or a `todo/` file, and the validator error is fed back into the per-raw retry.
- Tests cover happy-path sequential decomposition, dangling-id rejection, and self-loop rejection.
- `npm run sync-defaults` is run after editing `src/defaults/prompts/triage.md`.
- Coverage does not decrease vs the master baseline.

## Out of scope

- Cross-raw dependency inference (the agent currently sees only one raw at a time per BB-4).
- Cycle detection across the full queue graph — leave for a follow-up if it shows up in practice.
