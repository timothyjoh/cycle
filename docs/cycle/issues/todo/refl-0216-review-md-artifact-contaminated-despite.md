---
id: refl-0216-review-md-artifact-contaminated-despite
title: Fix artifact contamination at invocation layer — strip learning-mode context before all artifact-writing steps
workflow: feature
depends_on: []
triaged_at: "2026-05-21T09:41:42.675Z"
source: triage
---
## Problem

Cycle 0216's `REVIEW.md` opens with `"REVIEW.md and MUST-FIX.md written."` — a confirmation sentence — despite `src/defaults/prompts/review.md` carrying a `## File Artifact Mode` guardrail since cycle 0214. The same pattern has recurred in `SPEC.md` across multiple consecutive cycles. Both observations confirm that **prompt-text guardrails alone are insufficient** when the agent session carries learning-mode framing at invocation time.

## Root Cause

The learning-mode system context (`SessionStart` hook injects narration/explanation instructions) is active when artifact-writing steps (spec, plan, review, build, research, fix, documentation) are invoked. The `## File Artifact Mode` guardrail in each prompt competes with this session-level framing, and the session-level framing wins — causing leading confirmation sentences, markdown fences, and other conversational contamination in the artifact output.

This is an invocation-context problem, not a prompt-text problem. Adding more guardrail text without addressing the invocation context will continue to fail.

## Affected Steps

All artifact-producing cycle steps are potentially affected:
- `spec` — SPEC.md (confirmed recurring)
- `plan` — PLAN.md
- `review` — REVIEW.md (confirmed cycle 0216)
- `build` — BUILD.md
- `research` — RESEARCH.md
- `fix` — FIX.md
- `documentation` — DOCUMENTATION.md

## Approach

Fix at the invocation layer. Two options, not mutually exclusive:

### Option A — Strip/suppress learning-mode framing before artifact steps (preferred)

In the engine's step executor (likely `src/engine/exec-claudecode.ts` or a shared step-dispatch path), detect when the step type is artifact-producing and inject a system-prompt override or prepend a suppression directive that disables learning-mode narration for that invocation. This could be:
- A `--system-prompt` flag override passed to the agent CLI
- A leading instruction in the step prompt itself that explicitly cancels the session-level mode
- A dedicated `CYCLE_ARTIFACT_MODE=1` env var that the learning-mode hook checks before activating (requires coordinating with the hook)

### Option B — Add negative output examples to all artifact guardrails (belt-and-suspenders)

Augment the `## File Artifact Mode` section in each of the seven artifact-producing prompts to include an explicit negative example showing the exact contamination pattern (leading confirmation sentence, markdown fence wrapper) labeled `WRONG:`, followed by a `CORRECT:` example showing clean artifact output. Negative examples are stronger anchors than prohibition text alone.

## Implementation Notes

- The existing todo `refl-0214-spec-md-contamination-recurs-across-thre-fix-spec-step-learning-mode-conflict` targets spec specifically. Coordinate with or subsume that work — if Option A is implemented engine-wide, the spec-specific fix may be redundant.
- The learning-mode hook is injected via `SessionStart` in `.claude/settings.json` (or `settings.local.json`). The suppression mechanism must work without modifying the user's global settings.
- Verify fix by running a full cycle and confirming all seven artifact files contain no leading sentences, no markdown fences, and no commentary after the artifact body.

## Acceptance Criteria

- [ ] Root cause mechanism documented in ENGINE.md with clear explanation of why prompt-text guardrails are insufficient without invocation-layer changes.
- [ ] Invocation-layer suppression implemented for all seven artifact-producing step types (spec, plan, review, build, research, fix, documentation).
- [ ] At minimum Option B (negative examples) applied to all seven `## File Artifact Mode` guardrail sections if Option A is not yet feasible.
- [ ] Regression test added: assert that a simulated artifact-step invocation with learning-mode context active does not produce a leading confirmation sentence in the output.
- [ ] Full test suite passes (`npm test`) with no coverage regression.
- [ ] A cycle run that exercises at least one artifact step (spec or review) completes without contamination in the output artifact.
