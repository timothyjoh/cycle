# Must-Fix Items: Cycle 0006

## Summary
0 critical issues, 1 minor issue. The implementation, tests, and required
documentation (CLAUDE.md) are correct and complete. The single minor issue is a
documentation-accuracy gap: BUILD.md claims README.md was updated, but README.md
was never modified, and PLAN Task 5's "README updated or its non-applicability
recorded" criterion was not truthfully satisfied.

## Tasks

- [x] ### Task 1: Reconcile the README documentation claim (BUILD.md false claim + missing user-facing config note)
  **Status:** ✅ Fixed
  **What was done:** Took the preferred option. Added a "Top-level `defaults`"
    section to `docs/workflows.md` (the user-facing workflow-config reference)
    with a `defaults: { agent, model, thinking }` example, a sentence on the
    `step.X ?? defaults.X` resolution, and the `agent: bash` exception. Corrected
    BUILD.md line 12 to name `docs/workflows.md` (the file actually edited) instead
    of `README.md`, and recorded that no README change was required. Updated the
    BUILD.md Touched Files list (README.md → docs/workflows.md) to match reality.
  **Priority:** Minor
  **Files:** `docs/cycle/0006-feature-add-top-level-defaults-agent-model-think/BUILD.md`, `README.md` and/or `docs/workflows.md`
  **Problem:** BUILD.md line 12 states *"README gained a short `defaults:` example."*
    `git diff HEAD -- README.md` is empty and `README.md` does not appear in
    `git status` — README.md was not touched this cycle. SPEC's Documentation
    Updates section makes the README change conditional ("If `workflows.yml`
    configuration is surfaced to users, add a short example … otherwise note that
    no user-facing README change is required"), and PLAN Task 5 success criterion
    is "[ ] README updated or its non-applicability recorded." Neither outcome was
    truthfully delivered: the example was not added, and the BUILD.md note is a
    false positive rather than a recorded non-applicability decision. Separately,
    `docs/workflows.md` (the actual user-facing workflow-config reference, e.g.
    `docs/workflows.md:21,30-36`) still shows `agent: claudecode` on every step and
    makes no mention of the new top-level `defaults:` block, so the user-facing
    config reference is now stale — though SPEC named only CLAUDE.md/AGENTS.md/README,
    not docs/workflows.md.
  **Fix:** Choose one and make BUILD.md match reality:
    1. **Preferred** — add a short `defaults:` example to the user-facing config
       reference. The natural home is `docs/workflows.md` (which already shows the
       full `workflows.yml` schema with per-step `agent:`); add a `defaults:` block
       example with one sentence on the `step.X ?? defaults.X` resolution and the
       `agent: bash` exception. Then correct BUILD.md line 12 to name the file you
       actually edited (docs/workflows.md, not README.md), or add the example to
       README.md if that is the intended surface.
    2. **Alternative** — leave README/docs as-is and correct BUILD.md line 12 to
       record the non-applicability decision truthfully, e.g. "No user-facing
       README change required; workflow config detail lives in docs/workflows.md
       and the feature is documented in CLAUDE.md."
  **Verify:** `git diff HEAD -- README.md docs/workflows.md` shows the example if
    option 1 was taken; `grep -n "README" docs/cycle/0006-feature-add-top-level-defaults-agent-model-think/BUILD.md`
    no longer asserts an edit that did not happen (the line matches the files
    actually changed). No code or test changes are required.
