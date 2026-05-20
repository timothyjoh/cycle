---
id: refl-0193-run-cycle-forwarding-test-scope-should-i
title: Extend run-cycle forwarding test ACs to cover auggie spy case
workflow: feature
depends_on: [refl-0193-refl-0192-model-thinking-codex-only-open]
triaged_at: "2026-05-20T03:19:27.061Z"
source: triage
---
## Context

Cycle 0193 added `auggie` as a first-class agent with `model` and `thinking` step fields forwarded through `run-cycle.ts` — the same call site that handles codex. Issue `refl-0192-run-cycle-model-thinking-forwarding-path` tracks adding a unit test for this forwarding path, but its current acceptance criteria only specify a codex spy case. A refactor that silently drops `model`/`thinking` before calling `runStep` on an auggie step would pass all current tests undetected.

## Goal

Amend `docs/cycle/issues/todo/refl-0192-run-cycle-model-thinking-forwarding-path.md` to add an explicit auggie spy AC alongside the existing codex spy AC, before that issue is implemented.

## Acceptance Criteria

- [ ] `docs/cycle/issues/todo/refl-0192-run-cycle-model-thinking-forwarding-path.md` contains an explicit AC requiring an auggie-agent spy test: a spy on the auggie exec module's `runStep` with a step carrying `model` and `thinking` confirms both fields are forwarded.
- [ ] The existing codex spy ACs are retained (additive change only — no existing ACs removed or weakened).
- [ ] No production code is changed by this cycle — only the todo file is amended.

## Technical Notes

- The auggie forwarding path uses the same `run-cycle.ts` call site (~line 288) as codex; the fix is symmetric.
- After this ticket lands, `refl-0192-run-cycle-model-thinking-forwarding-path` will require both a codex spy and an auggie spy when it is implemented.
- Coordinate with `refl-0193-refl-0192-model-thinking-codex-only-open` (which broadens the AC framing at the issue level); this ticket targets the specific spy-test AC wording.
