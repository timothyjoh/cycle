---
id: refl-0194-run-cycle-forwarding-test-acs-don-t-yet
title: Extend run-cycle forwarding test ACs to cover opencode spy case
workflow: feature
depends_on: [refl-0193-run-cycle-forwarding-test-scope-should-i]
triaged_at: "2026-05-20T03:43:21.730Z"
source: triage
---
## Context

`refl-0193-run-cycle-forwarding-test-scope-should-i` amends the run-cycle forwarding test issue to add an auggie spy AC alongside the codex spy. opencode is now also a first-class agent using the same `run-cycle.ts` forwarding call site (`runStep` with `model` and `thinking` fields), but it appears in neither `refl-0192-run-cycle-model-thinking-forwarding-path` nor the auggie amendment issue.

A refactor that silently drops `model`/`thinking` before calling `runStep` on an opencode step would pass all current tests undetected. This is the same pattern as the auggie amendment — one more AC row in the todo file, no production code change.

## What to do

Amend `docs/cycle/issues/todo/refl-0193-run-cycle-forwarding-test-scope-should-i.md` to add one explicit AC row covering the opencode spy case. If that file has already been executed by the time this cycle runs, amend `docs/cycle/issues/todo/refl-0192-run-cycle-model-thinking-forwarding-path.md` instead.

No production source changes. No new test files. This cycle only appends an AC row to an existing todo file.

## Acceptance criteria

- [ ] The target todo file (`refl-0193-run-cycle-forwarding-test-scope-should-i.md` or `refl-0192-run-cycle-model-thinking-forwarding-path.md`) includes an AC asserting that `runStep` receives the correct `model` and `thinking` values when `run-cycle.ts` processes a step with `agent: opencode`
- [ ] The new AC follows the same spy/stub pattern as the codex and auggie ACs already present in that file
- [ ] No production source files (`src/`) are modified
- [ ] No new test files are created
- [ ] The diff is limited to one todo markdown file
