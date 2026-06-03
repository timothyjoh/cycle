# SPEC — Cycle 0046: Code-diff-free completion path for research/doc-only issues

## WHY
When an issue's deliverable is a document or finding rather than code — a research/spike issue ("investigate whether X is feasible; write up the answer", "decide the approach in an ADR") — triage routes it to the `feature` workflow, whose `build` step trips the empty-diff guard (empty `src scripts tests` diff) and scores the cycle **failed** even though the work was done correctly. The agent then burns `max_cycle_attempts` retries on the same non-failure, and in repos with the failed-residue guard it escalates to a dirty-worktree halt that drains nothing else in the queue. This has been observed twice (cycle `refl-0035…`, and the recon Understand-Anything headless-build spike). The engine is currently unusable for investigations and design decisions — exactly the work that should precede risky features.

## CONCRETE USER BENEFIT
A user can file a research/doc-only issue, mark it `expects_code: false` in the issue frontmatter, run the engine, and watch it complete: the doc deliverable is committed and the issue moves to `done/` with `cycle.end { status: "ok" }`. Today that same issue fails three times and halts the queue. After this cycle, an investigation or ADR is a first-class unit of work the engine can finish unattended.

## USABLE END-STATE
An issue carrying `expects_code: false` whose cycle writes only a `docs/**` deliverable (no `src`/`scripts`/`tests` change) completes as a normal `ok` cycle — the docs change is committed through the existing commit path, the issue drains to `done/`, no retries are burned on the empty-diff guard, and no residue halt fires. Issues without the opt-out behave exactly as today: an empty `src/scripts/tests` diff still fails.

## Objective
This cycle delivers a per-issue opt-out (`expects_code: false`, default `true`) that exempts an issue's cycle from the build-phase empty-diff guard when the deliverable is documentation. When the flag is set and a `build`/`fix` step exits 0 with an empty `src scripts tests` diff but a non-empty in-scope doc deliverable, the guard resolves the step to success instead of failure, letting the cycle complete `ok` through the unchanged commit path. The change reuses the existing marker-gated empty-diff guard site in `run-cycle.ts` rather than introducing a new workflow, keeping the slice small and the anti-slop posture intact for ordinary feature issues.

## Source Issue
`txt-20260603-173000-research-doc-only-issue-build-step` — "Give research/doc-only issues a code-diff-free completion path"

## Scope

### In Scope
- A per-issue `expects_code` boolean field (default `true`) parsed from issue frontmatter and plumbed to `runCycle` so the build-phase empty-diff guard can read it.
- A guarded branch at the existing build/fix empty-diff guard in `src/engine/run-cycle.ts`: when `expects_code === false`, the `src scripts tests` diff is empty, and a non-empty in-scope (non-denied) `docs/**` change exists, the step keeps `status: "ok"` (no failure, no `cycle.noop`) so the cycle proceeds to a normal `ok` completion that commits the docs change.
- `docs/ENGINE.md` documentation of the opt-out (field, default, guard interaction, anti-slop preservation) plus test coverage.

### Out of Scope
- Option A — a dedicated `research`/`spike` workflow with new prompts and `sync-defaults` changes. This cycle implements the per-issue opt-out (Option B) only.
- Changes to the research-phase no-op short-circuit or the `NOOP.md` marker schema (`src/engine/noop-marker.ts`).
- Auto-detecting research issues from title/body heuristics — the opt-out is an explicit frontmatter declaration.
- New completion-proof artifacts or changes to `STEP_ARTIFACTS`.

## Requirements
- `expects_code` is read from the source issue's YAML frontmatter; absent, non-boolean, or malformed values resolve to the default `true` (fail-closed — behaves exactly as today).
- The opt-out only relaxes the empty-diff guard. It does not skip steps, alter the commit path, or change behavior when a code diff *is* present (a code-bearing cycle on an `expects_code: false` issue commits normally).
- When the guard is relaxed, the cycle completes `ok` (the docs deliverable is committed by the unchanged `commitCycle` path); it is **not** routed through `noopDrain`/exit-3.
- The relaxed branch requires a non-empty in-scope doc deliverable: an `expects_code: false` cycle that produces **no** change at all (empty `src/scripts/tests` diff **and** no `docs/**` change) still fails — an opt-out is not a license to deliver nothing.
- **Anti-slop preserved:** an issue without `expects_code: false` (or with `expects_code: true`) and an empty `src/scripts/tests` diff still produces the existing `formatEmptyDiffGuardError` failure, byte-for-byte.
- **Failure behavior**: On a malformed/non-boolean `expects_code` value the field degrades to the `true` default (no crash, no warning required — the issue is treated as a normal code issue). If the issue file is missing or unreadable at the point the flag is resolved, the engine treats the issue as `expects_code: true` (the safe default) and the empty-diff guard fires as today; the unreadable-issue condition must not throw out of the guard or silently swallow into a false "ok". An `expects_code: false` cycle with no deliverable at all surfaces the empty-diff failure (errors surface — never a silent pass).

## Acceptance Criteria
- [ ] A fixture issue with `expects_code: false` whose `build` step exits 0, leaves an empty `src scripts tests` diff, and writes a non-empty `docs/**` file completes with `cycle.end { status: "ok" }` — the doc deliverable is committed and the issue drains to `done/` (user-observable benefit: a doc-only issue finishes successfully).
- [ ] The same fixture does **not** emit a `step.end { status: "failed" }` for the build step, does not re-run the build step, and triggers no failed-residue halt.
- [ ] A fixture issue **without** `expects_code: false` and an empty `src scripts tests` diff still fails the build step with the existing `formatEmptyDiffGuardError` message (anti-slop regression guard).
- [ ] **Failure-path:** an `expects_code: false` cycle whose build step produces an empty `src scripts tests` diff **and** no `docs/**` change still fails the empty-diff guard (an empty opt-out cycle is not coerced to "ok").
- [ ] **Failure-path:** a malformed/non-boolean `expects_code` value (e.g. `expects_code: maybe`) resolves to the `true` default and the guard fires as today — verified by a unit test of the field-resolution helper.
- [ ] `docs/ENGINE.md` documents the `expects_code` opt-out under the empty-diff/no-op section.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- `node --test` (the repo's existing `--experimental-strip-types` suite), with coverage via `npm run test:coverage` (per-file floors enforced; `src/engine/run-cycle.ts` ≥ 90%).
- Pure unit test for the `expects_code` resolution helper: `true`/`false`/absent/non-boolean/malformed → resolved boolean.
- `run-cycle` integration tests driving the build-phase guard:
  - happy path — opt-out + empty code diff + non-empty `docs/**` change → `cycle.end { status: "ok" }`, build `step.end { status: "ok" }`, single execution (cardinality-pin the build `step.end` with `filter(...).length === 1`).
  - anti-slop regression — no opt-out + empty diff → existing failure preserved.
  - failure path — opt-out + empty diff + no doc deliverable → empty-diff failure.
  - failure path — unreadable/missing issue file at flag-resolution → defaults to `true`, guard fires.
- Confirm the relaxed path does not emit `cycle.noop` (it is an `ok` completion, not a no-op).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Note the `expects_code: false` issue-frontmatter opt-out alongside the no-op / empty-diff guard description in the Workflow defaults section.
- **docs/ENGINE.md**: Document the opt-out in the empty-diff / no-op resolution section — field name, default (`true`), the relaxed-guard condition (opt-out + empty code diff + non-empty in-scope doc change ⇒ `ok`), the no-deliverable failure case, and the anti-slop guarantee for non-opt-out issues.
- **README.md**: No user-facing change beyond the engine-docs note unless the README enumerates issue frontmatter fields; if it does, add `expects_code`.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing issue frontmatter parser (`src/engine/frontmatter.ts`) and the issue-lifecycle/triage path that already reads frontmatter fields (`priority`, `depends_on`).
- The existing build-phase empty-diff guard and `formatEmptyDiffGuardError` in `src/engine/run-cycle.ts`, and the `isDenied` in-scope filter (`src/engine/path-utils.ts`).
- `runCycle` already receives `opts.issueId`, providing the path to read the source issue's frontmatter; no new external service or env var is required.
