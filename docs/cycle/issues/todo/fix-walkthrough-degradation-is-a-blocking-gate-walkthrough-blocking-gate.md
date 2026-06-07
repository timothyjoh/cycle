---
id: fix-walkthrough-degradation-is-a-blocking-gate-walkthrough-blocking-gate
title: Walkthrough degradation must gate (fail) a UI-shipping cycle, not just flag it
workflow: feature
depends_on: []
triaged_at: 2026-06-07T14:36:03.429Z
source: triage
priority: high
parent: fix-walkthrough-degradation-is-a-blocking-gate
---
## Problem (thesis violation)

The walkthrough is the engine's own "did the running app actually work" signal, but it is declared supplementary and **never fails a cycle**. When it degrades (the hook captured only a fallback/home/login page instead of the cycle's real feature), the reflection step merely *flags* it. So a UI-shipping `feature` cycle whose walkthrough proved nothing still drains `ok`.

Live evidence (blended): every recent cycle's walkthrough degraded to a single `/login` screenshot (the per-cycle scenario hit its auth precondition and bailed); the cycles still passed. The strongest available "app doesn't actually work / wasn't demonstrated" signal was ignored for pass/fail.

This is the most cycle-core lever of the 0.3 thesis batch — the engine already owns the `walkthrough_capture` step (`src/engine/walkthrough.ts`) and its degradation sidecar; it just isn't allowed to fail the cycle. See CLAUDE.md → *Core thesis (no false greens)* and `BRIEF.md`.

## Scope

Promote the walkthrough degradation signal from a reflection flag to a **blocking gate** for UI-shipping cycles:

- When a walkthrough hook is **present and ran** and reports degradation (the hook-owned degradation sidecar `{ degraded: true }`, and/or the engine's own "only the home/fallback chapter was captured" detection), and the cycle ships UI, the cycle must **fail/block** with a clear diagnostic, not pass.
- Must stay inert where there is genuinely nothing to demonstrate: **no hook present ⇒ no gate**. cycle's own headless CLI repo configures no hook and must remain unaffected — `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` as today, no `step.start`, no failure.
- A non-UI / doc-only cycle (the existing `expects_code: false` opt-out, `src/engine/run-cycle.ts`) is **not** gated.
- Make it configurable and fail-closed for UI `feature` cycles (e.g. `engine.walkthrough_required` config and/or a per-issue `expects_ui` frontmatter field), so the policy is explicit and repos opt into the strictness their app needs. Follow the defensive-coercion convention used by the other `engine.*` flags (absent/non-boolean/malformed ⇒ resolved at the read site).
- Route a degraded-and-gated cycle through the existing fatal step-failure path so it produces the same `step.end { status: "failed" }` → `cycle.end { status: "failed" }` pairing as every other terminal path — never a silent kill. Emit a clear, named diagnostic (e.g. a `step.warning`/`engine.*` event plus stderr text) explaining the feature was not demonstrated.

## Acceptance criteria

- [ ] A UI-shipping `feature` cycle whose present-and-run walkthrough hook degraded (sidecar `degraded: true` or only-fallback/home/login captured) fails/blocks with a clear "walkthrough did not demonstrate the feature" diagnostic — not a silent pass + reflection flag.
- [ ] No hook present ⇒ inert (no gate, no failure), preserving cycle's own repo and any repo without a walkthrough hook (`walkthrough_hook_absent` skip path unchanged).
- [ ] Doc-only / non-UI cycles (`expects_code: false`, or a UI cycle that ships no UI) are not gated.
- [ ] Configurable + fail-closed for UI feature cycles; defensively coerced at the read site; documented in CLAUDE.md and `docs/ENGINE.md` → *Walkthrough capture*.
- [ ] Tests: hook-degraded + UI cycle → block; hook-clean → ok; no hook → inert; doc-only → not gated. Cardinality-pin any new exactly-once event with `filter(...).length === 1`.
- [ ] Coverage holds at/above the per-file floor for `src/engine/walkthrough.ts` (95%) and any touched module; no coverage regression vs baseline.

## Out of scope

- Authoring/driving the per-cycle scenarios (that is the consumer repo's hook + prompts).
- Verify/e2e gating — handled by siblings `fix-verify-must-exercise-running-app` and `fix-no-false-greens-unverified-blocks`.

One of three thesis-operationalizing fixes (0.3 batch). Independent of the two verify-gating siblings already in the queue (no causal dependency — they touch the verify/e2e lane, this touches the walkthrough lane).
