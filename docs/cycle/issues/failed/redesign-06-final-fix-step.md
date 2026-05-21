---
id: redesign-06-final-fix-step
source: text
title: Add final_fix + final_verify steps to the feature workflow for in-cycle remediation
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 3
priority: high
failed_at: "2026-05-21T03:26:14.329Z"
failed_step: triage
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §2. **Prerequisite: redesign-04 (touched.json + scope-guard demote) must land first** — otherwise final_fix's src/ edits get blocked at commit.

## Problem

Reflection runs after `fix`, so trivial in-scope sharp edges it spots cannot be remediated within the cycle that produced them — they can only become future issues. We want a bounded, mechanical, in-footprint fix pass *before* the cycle commits.

## Approach

Extend the `feature` workflow tail to:

```
… fix → verify → reflection → final_fix → final_verify → documentation
```

- **`final_fix`** — agent step, `skip_unless: FINAL_FIXES.md`. Reads `FINAL_FIXES.md` (written by reflection in redesign-07), applies only fixes confined to the cycle footprint (`touched.json`), and self-runs the full suite. Note: `final_fix` is NOT named `fix`, so it does NOT inherit the `fix`-keyed empty-diff / fix-vs-MUST-FIX guards (`src/engine/run-cycle.ts:317,328`) — that's intended; `final_verify` is its gate.
- The engine appends `final_fix`'s git delta to `touched.json` (so its changes are part of the footprint and never trip a scope warning).
- **`final_verify`** — bash step running `scripts/verify.sh`. **Distinct name** (not `verify`): `log-tail.ts:61` dedups `completedSteps` by name, so a second step named `verify` would be skipped on resume.
- Add the soft self-check ("do not finish until the full suite passes") to `build`, `fix`, and `final_fix` prompts.
- This issue can ship with an empty/placeholder FINAL_FIXES contract; redesign-07 makes reflection produce it. Until then `final_fix` is simply skipped (no FINAL_FIXES.md), so the workflow stays green.

## Acceptance Criteria

- [ ] `feature` workflow has `reflection → final_fix (skip_unless FINAL_FIXES.md) → final_verify (bash) → documentation`.
- [ ] With no FINAL_FIXES.md, `final_fix` is skipped and the cycle behaves as before.
- [ ] With a FINAL_FIXES.md, `final_fix` runs, its delta is appended to `touched.json`, and `final_verify` gates on real test pass.
- [ ] `final_verify` has a distinct step name and is not collapsed on resume.
- [ ] build/fix/final_fix prompts carry the soft self-check instruction.
- [ ] Agent-fleet/structural updates done (new step name, REGISTRY unaffected since final_fix uses claudecode; bash final_verify).
- [ ] Tests cover: skip path, run path, footprint append, resume not skipping final_verify.
- [ ] Recommended workflow: `feature`.
