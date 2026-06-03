# Must-Fix Items: Cycle 0035

## Summary
1 critical issue (doc-vs-code contradiction on detection scope), 0 minor
blocking issues. The engine change, tests, coverage (100% on
`run-cycle.ts`), and typecheck are all clean — the only defect is that
the documentation overstates the scope of the research-phase
short-circuit.

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): Docs claim feature-only scope, but the intercept fires for any `research` step
  **Status:** ✅ Fixed
  **What was done:** Took the recommended path — corrected the docs to
    match the name-keyed code (`run-cycle.ts:689` gates on
    `step.name === "research"` with no workflow check). In
    `docs/ENGINE.md:172` deleted the "(Scoped to the `feature` workflow's
    `research` step; … not yet wired)" parenthetical and reworded the
    lead-in to "After any workflow's `research` step (so the `feature` and
    `e2e-tests` `research` steps both qualify)", adding a note that the
    intercept is name-keyed and consistent with the build/fix fallback. In
    `CLAUDE.md:83` and `CLAUDE.md:121` changed "after the `feature`
    workflow's `research` step exits 0" to "after a `research` step exits 0
    (any workflow, e.g. `feature` / `e2e-tests`)". Verify checks pass:
    `grep -n "not yet wired" docs/ENGINE.md` returns nothing, and no
    "feature workflow's research" claim remains in the docs. Docs-only
    change — no code touched, so no new test required.
  **Priority:** Critical
  **Doc:** `docs/ENGINE.md:172` (primary), `CLAUDE.md:83`, `CLAUDE.md:121`
  **Claim prose:** "After the `feature` workflow's `research` step exits
    `status: ok` … (Scoped to the `feature` workflow's `research` step;
    other workflows with a `research` step are not yet wired.)"
  **Expected backing:** `src/engine/run-cycle.ts:689` — the intercept is
    gated on `if (r.status === "ok" && step.name === "research")` with
    **no** workflow check. The `e2e-tests` workflow declares a `research`
    step at `src/defaults/workflows.yml:68` (and `.cycle/workflows.yml:68`),
    so that step **is** wired into this short-circuit — directly
    contradicting "other workflows with a `research` step are not yet
    wired." (This is consistent with the existing build-phase fallback,
    which is also name-keyed on `step.name === "build" || step.name === "fix"`
    at `run-cycle.ts:654` and already covers the `e2e-tests` `fix` step
    at `workflows.yml:72`.)
  **Fix:** Choose one — the doc correction is recommended (it matches the
    established name-keyed build/fix precedent and is the minimal change):
    - **(Recommended) Correct the docs to match the code.** In
      `docs/ENGINE.md:172`, delete the parenthetical
      "(Scoped to the `feature` workflow's `research` step; other
      workflows with a `research` step are not yet wired.)" and reword
      the lead-in from "After the `feature` workflow's `research` step"
      to "After any workflow's `research` step (so the `feature` and
      `e2e-tests` `research` steps both qualify)", consistent with the
      name-keyed build/fix fallback. In `CLAUDE.md:83` and `CLAUDE.md:121`,
      change "after the `feature` workflow's `research` step exits 0" to
      "after a `research` step exits 0 (any workflow, e.g. `feature` /
      `e2e-tests`)".
    - **(Alternative) Gate the code to the `feature` workflow** so the
      docs become true: change `run-cycle.ts:689` to also require the
      active workflow be `feature` (e.g. `&& opts.workflow === "feature"`),
      and add a regression test that an `e2e-tests` `research` step with a
      valid `NOOP.md` does **not** short-circuit. Note this would diverge
      from the name-keyed build/fix precedent — only take this path if
      feature-only scoping is genuinely intended.
  **Verify:** `grep -n "not yet wired" docs/ENGINE.md` returns nothing
    (recommended path); `grep -n "step.name === \"research\"" src/engine/run-cycle.ts`
    and the chosen doc text agree on scope. If the alternative is taken,
    a new test asserting no `cycle.noop` for an `e2e-tests` `research`
    marker passes.
