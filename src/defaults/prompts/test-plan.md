# Create E2E Test Plan for Cycle

You are tasked with creating a concrete plan for writing or extending
Playwright end-to-end tests for the work area named by this cycle.

RESEARCH.md captured what exists in the codebase. There is no SPEC — the
behavior to test is whatever the code currently does (the source of truth
is the running app and the existing code). Your job is the HOW: a
concrete list of test scenarios to add, each verifiable by a Playwright
spec.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow` (= `e2e-tests`), `title`, `issue_id`.
2. **RESEARCH.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/RESEARCH.md`
   — relevant code paths, routes, components, current user flows.
3. **Existing Playwright config + tests**: typically `playwright.config.*`
   plus `tests/e2e/` or `e2e/`. Note conventions in use — and whether
   `retries` is configured. Browser e2e is timing-sensitive; the suite
   should run with `retries: 3` so a transient flake never fails the gate.
   If the config lacks `retries`, flag it so the build step adds it.

## Process

### Step 1: Identify the Surface Under Test

From RESEARCH.md plus light codebase exploration, list the user-visible
flows or API contracts that the cycle's issue title points at. Be
explicit about which routes, endpoints, or UI states each flow touches.

### Step 2: Inventory Existing E2E Coverage

For each identified flow, find existing Playwright specs that already
cover it. Note: what scenarios are covered, what's missing, where the
gap is.

### Step 3: Design Test Scenarios

For each gap, design one or more test scenarios. Each scenario:
- Maps to a real user flow or contract — not implementation internals.
- Has a clear arrange / act / assert structure.
- Uses **stable selectors** (test ids, accessible roles) — not brittle
  CSS or text fragments that drift.
- Reuses existing fixtures, page objects, or helpers where possible.
- Avoids cross-test state coupling.
- Covers failure paths, not just success. For each flow, design at least
  one scenario that exercises an error or degraded condition: invalid/empty
  input and validation rejection, a dependency returning 4xx/5xx or timing
  out (use network-layer interception per Guideline 4), and missing/absent
  data. Assert the app surfaces the failure visibly (error message, retry
  affordance, disabled control) rather than hanging or silently swallowing
  it.

### Step 4: Write the Plan

Output the document below to **stdout** — the engine captures stdout and
writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md`.

```markdown
# E2E Test Plan: Cycle <cycle_id>

## Surface Under Test
[Routes, components, or API endpoints the test plan targets.]

## Existing Coverage (from Research)
[What's already tested. Files. Briefly what each spec asserts.]

## Coverage Gaps
[What's not tested today that should be.]

## What We're NOT Doing
[Out-of-scope tests, refactors, or production-code changes.]

## New / Extended Spec Files
- `tests/e2e/<name>.spec.ts` — [purpose]

---

## Scenario 1: [Descriptive Name]

### Flow
[Step-by-step from the user's perspective]

### Arrange
- [Seed data / auth / nav / fixture setup]

### Act
- [User actions; click / fill / navigate]

### Assert
- [Concrete checks — URL, text, role state, network response, AND for
  failure scenarios: visible error message / retry control / non-crashing
  degraded state.]

### Selectors
- `[selector]` — [why this one is stable]

---

## Scenario 2: [Descriptive Name]
[Same structure…]

---

## Fixtures / Helpers

### Reused
- [Existing fixture] — [why it fits]

### New (if any)
- [New helper] — [why it can't be inline]

## Browser / Project Matrix
- Browsers: [chromium / firefox / webkit / all — and why]
- Viewport: [default / specific sizes]
- Auth state: [stored / fresh per test]

## Risk Assessment
- [Flake risk]: [mitigation — retries, explicit waits over implicit, etc.]
- [Cross-test state]: [mitigation]

## Failure-Path Coverage
- [Flow]: [error/degraded condition tested] — [expected user-visible behavior]
```

## Important Guidelines

1. **Test user-visible behavior, not internals.** No reaching into
   private state or stubbing the page's own modules.
2. **Stable selectors only.** Prefer `getByRole`, `getByTestId`, named
   landmarks. Avoid raw CSS unless that's the only stable handle.
3. **Idempotent tests.** No order dependencies, no leaked state between
   specs.
4. **Real implementations over mocks.** Mock external services at the
   network layer only when the real service is impractical (cost,
   flakiness, third-party rate limits).
5. **Explicit waits.** Use Playwright's auto-waiting + `expect.poll` /
   `expect(...).toHaveText(...)` patterns. No bare `waitForTimeout`.
6. **Vertical scenarios.** Each scenario is a complete user flow, not a
   single click in isolation.
7. **Negative paths are in scope.** A plan that tests only success paths
   is incomplete. Inject dependency failures at the network layer to
   confirm the app degrades gracefully and never fails silently.
8. **Respect scope.** Tests in the plan; no production code changes
   unless the build step turns out to truly need them — in which case
   call them out in the build summary as a deviation.
