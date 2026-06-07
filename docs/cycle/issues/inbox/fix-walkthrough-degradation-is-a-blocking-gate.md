---
id: fix-walkthrough-degradation-is-a-blocking-gate
source: manual
title: "Walkthrough degradation must gate (fail) a UI-shipping cycle, not just flag it"
added_at: 2026-06-07T14:30:00Z
priority: high
---

## Problem (thesis violation)

The walkthrough is the engine's own "did the running app actually work" signal, but it is declared supplementary and **never fails a cycle**. When it degrades (the hook captured only a fallback/home/login page instead of the cycle's real feature), the reflection step merely *flags* it. So a UI-shipping `feature` cycle whose walkthrough proved nothing still drains `ok`.

Live evidence (blended): every recent cycle's walkthrough degraded to a single `/login` screenshot (the per-cycle scenario hit its auth precondition and bailed); the cycles still passed. The strongest available "app doesn't actually work / wasn't demonstrated" signal was ignored for pass/fail.

## Scope

Promote the walkthrough degradation signal from a reflection flag to a **blocking gate** for UI-shipping cycles:

- When a walkthrough hook is **present and ran** and reports degradation (the hook-owned degradation sidecar `{ degraded: true }`, and/or the engine's own "only the home/fallback chapter was captured" detection), and the cycle ships UI, the cycle must **fail/block** with a clear diagnostic, not pass.
- Must stay inert where there is genuinely nothing to demonstrate: **no hook present ⇒ no gate** (cycle's own headless CLI repo configures no hook and must remain unaffected — `step.end skipped reason: walkthrough_hook_absent` as today). A non-UI / doc-only cycle (see `expects_code: false`) is not gated.
- Make it configurable/fail-closed for UI `feature` cycles (e.g. `engine.walkthrough_required` or a per-issue `expects_ui`), so the policy is explicit and repos opt into the strictness their app needs.

## Acceptance criteria

- [ ] A UI-shipping `feature` cycle whose present-and-run walkthrough hook degraded (sidecar `degraded:true` or only-fallback captured) fails/blocks with a clear "walkthrough did not demonstrate the feature" diagnostic — not a silent pass + reflection flag.
- [ ] No hook present ⇒ inert (no gate, no failure), preserving cycle's own repo and any repo without a walkthrough.
- [ ] Doc-only / non-UI cycles are not gated.
- [ ] Configurable + fail-closed for UI feature cycles; documented.
- [ ] Tests: hook-degraded + UI cycle → block; hook-clean → ok; no hook → inert; doc-only → not gated.

## Out of scope

- Authoring/driving the per-cycle scenarios (that is the consumer repo's hook + prompts).
- Verify/e2e gating (siblings `fix-verify-must-exercise-running-app`, `fix-no-false-greens-unverified-blocks`).

One of three thesis-operationalizing fixes (0.3 batch). This is the most cycle-core lever of the three — the engine already owns the walkthrough step and its degradation sidecar; it just isn't allowed to fail the cycle.
