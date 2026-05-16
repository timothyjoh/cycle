# Implement Cycle

You are the Build Lead. Implement this cycle's work according to the
plan.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **SPEC.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` — what
   we're building.
3. **RESEARCH.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/RESEARCH.md`
   — codebase state before.
4. **PLAN.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md` — how
   to build it. Follow this closely.

## How to Build

1. **Tests first when feasible.** Write the failing test for a slice,
   then implement, then verify the test passes. This is the cheapest
   way to catch SPEC drift.
2. **Vertical slice at a time.** Land one slice end-to-end (test +
   implementation + any wiring) before moving to the next. Do not
   half-finish multiple slices in parallel.
3. **Run the test suite as you go.** After each slice, run the
   project's verify command (per `CLAUDE.md` / `AGENTS.md` / `package.json`)
   and confirm no regression. The `verify` step at the end of this
   workflow will run it again, but earlier discovery is cheaper.
4. **Check coverage before declaring done.** Run the project's
   coverage command (in this repo: `npm run test:coverage`; otherwise
   per `CLAUDE.md`). Capture line / branch / function percentages.
   Coverage must **not decrease** vs the cycle's base branch. New code
   needs new tests in the same cycle, not as follow-up.
5. **Follow existing patterns.** Use the conventions RESEARCH.md
   identified. Do not invent new abstractions when an existing one
   fits.
6. **Update docs as part of "done."** CLAUDE.md / AGENTS.md / README.md
   updates required by SPEC are part of this step.

## Quality Gates Before You Finish

- [ ] All tests pass.
- [ ] Coverage report run via the project's coverage command; line /
      branch / function percentages captured and **none regressed**
      vs the cycle's base branch. (In this repo: `npm run test:coverage`.)
- [ ] Code follows existing patterns from RESEARCH.md.
- [ ] CLAUDE.md / AGENTS.md updated with any new commands, conventions,
      or architecture decisions.
- [ ] README.md updated with any user-facing changes.
- [ ] No compiler / linter warnings.

## Important Rules

- **Do NOT commit.** The next step (`commit.sh`) handles that. Leave
  the working tree dirty with your changes.
- **Do NOT add features outside SPEC.** Resist scope creep — if you
  discover something legitimately required but not in SPEC, note it in
  the build summary; it becomes follow-up work, not part of this cycle.
- **If you encounter something not covered in PLAN.md**, make a
  reasonable decision and document it in the build summary.
- **If a planned approach doesn't work**, adapt but stay within SPEC's
  scope.
- **Prefer real implementations in tests** over heavy mocking. The
  review step will flag mock abuse.

## Output

When you're done, output a one-paragraph summary **to stdout**
describing:
- What files you created or modified (with line counts).
- Which PLAN.md tasks are now complete.
- The full test-suite command you ran and its result.
- The coverage command you ran and the line / branch / function
  percentages (plus any per-file regressions and how you addressed
  them).
- Any deviations from PLAN.md and why.
- Any deferred work or follow-up notes.
- The `## Touched Files` YAML list: every file you created, modified, or deleted — exact repo-relative paths, no globs. Format:

  ```
  ## Touched Files
  - src/engine/commit-cycle.ts
  - tests/engine/commit-cycle.test.ts
  ```

The engine captures stdout and writes it to
`docs/cycle/<cycle_id>-<workflow>-<slug>/BUILD.md`. Nothing else in the
output — no preamble or closing remarks.
