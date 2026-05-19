---
id: refl-0052-research-pass-doesnt-enumerate-step-coun
title: Add workflow-shape-mutation checklist to research.md so step-count parity tests are surfaced before BUILD
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:03:14.810Z"
source: triage
---
## Problem

When a cycle mutates the shape of `src/defaults/workflows.yml` (add step, remove step, rename agent, change prompt path), the RESEARCH pass currently has no checklist item that forces enumeration of test files which hard-code the workflow shape. Cycle 0052 hit this exactly: PLAN Task 5 enumerated five sub-steps but did not anticipate that `tests/defaults/feature-yaml.test.ts:11-12` and `tests/defaults/feature-loadable.test.ts:14-19` pin the 10-step `feature` sequence and would fail when the 11th step (`documentation`) landed. Builder caught it manually and BUILD.md flagged the deviation; REVIEW Finding #2 logged it as a process gap.

This is recurring — every future workflow-shape mutation will hit the same blind spot unless RESEARCH explicitly looks for these assertions.

## Direction

Two viable approaches; pick the one whose cost/leverage is best after a brief look at the test layer:

1. **Prompt-side checklist (low cost, low coupling).** Add a single line to `src/defaults/prompts/research.md` instructing the agent: when the cycle's diff is expected to touch `src/defaults/workflows.yml`, grep `tests/defaults/` and `tests/engine/` for hard-coded step counts, exact step-name array literals, and `.length` assertions on `workflow.steps`, and list every match in RESEARCH.md as a Task to update.

2. **Source-of-truth refactor (higher cost, eliminates the class of bug).** Export a single canonical step-name array from a test-harness module and rewrite `feature-yaml.test.ts` / `feature-loadable.test.ts` to loop over it, so adding a step touches exactly one place. RESEARCH then doesn't need a checklist for this class — the structural pressure is gone.

Approach #1 is the cheap insurance; approach #2 is the durable fix. Spec should weigh both and either pick one or land #1 immediately and queue #2 as a follow-up.

## Acceptance

- RESEARCH.md emitted by a cycle whose diff touches `src/defaults/workflows.yml` enumerates every test in `tests/defaults/` and `tests/engine/` that pins workflow-step count, exact step-name array, or `workflow.steps.length`.
- PLAN built from that RESEARCH includes an explicit task to update each enumerated test in the same cycle as the workflow-shape mutation.
- If approach #2 is taken: `tests/defaults/feature-yaml.test.ts` and `tests/defaults/feature-loadable.test.ts` no longer carry an inline step-name array literal; they iterate a single exported constant.

## Out of scope

- Generalizing the checklist to non-workflow shape mutations (prompt-only edits, script-only edits). The trigger is specifically a diff touching `src/defaults/workflows.yml`.
- Retroactively rewriting historical RESEARCH.md outputs.
