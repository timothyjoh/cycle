---
id: fix-verify-must-exercise-running-app
source: manual
title: "Verify must exercise the running app (e2e/integration), not just unit tests"
added_at: 2026-06-07T14:30:00Z
priority: high
---

## Problem (thesis violation)

Per the Core thesis (BRIEF.md), every cycle must leave the app demonstrably working. Today the `verify` gate proves no such thing: the default `verify.sh` falls through to `npm test`, which in a typical repo runs **unit tests only**. The end-to-end suite that actually drives the running app is a separate script the gate never invokes.

Live evidence (blended): `verify.sh` → `npm test` → `vitest run` (unit). The app's Playwright suite is `test:e2e: playwright test` — **never called by verify**. So cycles 0019/0020/0021 went `verify ok → cycle.end ok → done/` while nothing ever exercised the running app. Green meant "units pass," not "the app works."

## Scope

Make the verify gate exercise the running application when the repo has an e2e/integration suite, framework-agnostically:

- The default `src/defaults/scripts/verify.sh` should detect a running-app test suite (e.g. a `test:e2e` / `e2e` npm script, or a `playwright.config.*` / `cypress.config.*`) and run it **in addition to** unit tests, failing verify if it fails. Keep the existing unit-test run.
- Detection must be by-convention and skippable for repos that genuinely have no app to drive (a library / CLI like cycle itself), so those repos are unaffected.
- Document the expectation: a repo whose `feature` cycles ship UI/behavior must have verify drive the running app.

## Acceptance criteria

- [ ] Default `verify.sh` runs the repo's e2e/integration suite when a recognized one is present (`test:e2e`/`e2e` script or a known e2e config), after the unit run; an e2e failure fails verify (non-zero).
- [ ] Repos with no e2e suite behave exactly as today (unit-only), no spurious failure.
- [ ] `npm run sync-defaults` run; docs updated (verify policy + thesis link).
- [ ] Tests cover: e2e-present-and-passing → verify ok; e2e-present-and-failing → verify fails; e2e-absent → unchanged.

## Out of scope

- Forcing a specific e2e framework.
- Detecting a degenerate/all-skipped test run (see `fix-no-false-greens-unverified-blocks`).
- Walkthrough gating (see `fix-walkthrough-degradation-is-a-blocking-gate`).

This is one of three thesis-operationalizing fixes (0.3 batch). It ensures verify *runs* the app; the siblings ensure a skipped/degraded run can't masquerade as success.
