---
id: fix-no-false-greens-unverified-blocks
title: "No false greens: a skipped/degenerate verification run must block, not pass"
workflow: feature
depends_on: []
triaged_at: 2026-06-07T14:35:05.555Z
source: triage
priority: high
---
## Problem (thesis violation)

Per the Core thesis (BRIEF.md): "Verification that is skipped, degraded, or stubbed is not verification, and a false green is a failure." Today the engine trusts the `verify` exit code alone. A test run that is green **only because the meaningful tests skipped** is treated as success.

Live evidence (blended): every auth-requiring e2e spec is `test.skip(...)` when `INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID` are unset (which they are). So even once e2e is in the verify path (sibling issue), a run where the entire auth suite skipped would still exit 0 and pass. The app's behavior was never actually asserted, yet the cycle would drain `ok`.

## Scope

Teach the engine to recognize a **degenerate verification** and treat it as unverified -> fail/block (fail loud), rather than pass:

- Capture the test runner's executed/skipped/total counts from the verify step output (parse the common reporters, defensively; unknown format degrades to today's exit-code-only behavior so nothing regresses).
- Define a policy (engine/workflow-configurable, fail-closed for UI `feature` cycles) for what counts as unverified, e.g.: a run that executed **zero** non-skipped tests, or a UI-shipping cycle where the e2e/integration portion was entirely skipped.
- When unverified: emit a structured event (e.g. `verify.unverified { skipped, executed, reason }`) and route through the normal step-failure/block path with a clear stderr message ("verification incomplete: N tests skipped, 0 executed — cannot confirm the app works"). Never drain to `done/ ok`.

## Acceptance criteria

- [ ] A verify run that is green but executed zero non-skipped tests (or whose e2e portion fully skipped on a UI cycle) does NOT pass — the cycle blocks/fails with a clear "unverified" diagnostic.
- [ ] A run with real executions + some legitimate skips still passes (don't over-block; the bar is "meaningful verification ran," not "zero skips ever").
- [ ] Unparseable reporter output degrades to current exit-code-only behavior (no regression, no false block).
- [ ] Tests: all-skipped -> block; zero-tests -> block; normal pass-with-few-skips -> ok; unparseable -> unchanged.
- [ ] Docs updated (no-false-greens policy + thesis link).

## Out of scope

- Running e2e in the first place (sibling `fix-verify-must-exercise-running-app`).
- Walkthrough degradation gating (sibling `fix-walkthrough-degradation-is-a-blocking-gate`).

One of three thesis-operationalizing fixes (0.3 batch). The design of "what counts as unverified" should be refined in spec/plan; bias fail-closed for UI feature cycles, lenient for libraries.
