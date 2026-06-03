Based on the slug `spec-step-must-state-why-concrete-user-b`, the artifact path is `docs/cycle/0032-feature-spec-step-must-state-why-concrete-user-b/SPEC.md`.

# SPEC — Cycle 0032: Spec step must demand WHY + concrete user benefit; review must verify it was delivered

## WHY
cycle can ship work that passes every mechanical acceptance criterion yet delivers nothing a user can actually do. In maestro's UI (2026-06-02) each slice S0–S7 passed on mechanics — cards render, the counts endpoint returns a number, the chat skeleton mounts — but the whole was unusable: no way to add a project, the chat wired to nothing, the homepage off-layout. Every slice specified a *mechanism* and was graded on the mechanism; none asked "after this round, what can a user DO that they couldn't before?" So "technically done, practically useless" slipped through. Relying on perfectly-written input issues is fragile; the guard belongs in the process — the spec and review prompts — not in the input.

## CONCRETE USER BENEFIT
After this cycle, an operator running cycle on any repo gets two hardened defaults: the `spec` step refuses to emit a SPEC that does not open with a stated user-observable benefit (or a flagged scaffolding escape hatch), and the `review` step treats "the promised user benefit was not actually delivered" as a MUST-FIX rather than a pass. The observable change: a freshly synced `.cycle/prompts/spec.md` contains a mandatory user-benefit opening block, and `.cycle/prompts/review.md` contains a benefit-delivery verification rule — both reachable by every future cycle without further work.

## USABLE END-STATE
`src/defaults/prompts/spec.md` and `src/defaults/prompts/review.md` carry the new mandates, `.cycle/prompts/` mirrors them byte-for-byte (post `sync-defaults`), and the prompt-shape test suite asserts the new mandates are present so they cannot silently regress.

## Objective
Harden the autonomous-delivery loop against the "passes mechanical criteria but delivers no usable value" failure mode by editing two engine default prompts. The `spec` prompt must force every SPEC to open with WHY / CONCRETE USER BENEFIT / USABLE END-STATE (with an explicit SCAFFOLDING ESCAPE HATCH for genuinely foundational rounds), and require at least one acceptance criterion phrased as the user-observable benefit. The `review` prompt must verify the work actually delivers that stated benefit (or that the scaffolding flag is honest), routing a failure to MUST-FIX. This is a prompt-only change — no engine code, repo-agnostic, benefiting every cycle.

## Source Issue
`txt-20260602-223000-spec-step-demand-user-benefit` — "Spec step must state WHY + concrete user benefit + usable end-state, and review must verify it was delivered"

## Scope

### In Scope
- Edit `src/defaults/prompts/spec.md` to mandate the WHY / CONCRETE USER BENEFIT / USABLE END-STATE / SCAFFOLDING ESCAPE HATCH opening block and a user-benefit acceptance criterion; run `npm run sync-defaults` so `.cycle/prompts/spec.md` matches.
- Edit `src/defaults/prompts/review.md` to add a user-benefit-delivery verification rule (benefit not actually deliverable ⇒ MUST-FIX, not pass); the sync above mirrors it to `.cycle/prompts/review.md`.
- Extend the prompt-shape tests (`tests/defaults/spec-prompt-ac.test.ts`, `tests/defaults/review-prompt-spec-ac.test.ts`) to assert the new mandates and the byte-identical dogfood-copy invariant for both prompts.

### Out of Scope
- Any change to `src/engine/**` or other engine code (the issue explicitly states no engine change is required).
- Edits to other prompts (`build.md`, `plan.md`, `final_fix.md`, etc.).
- Reworking the existing Acceptance Criteria / File Artifact Mode mandates already present in these prompts (only additive).
- Updating maestro or any downstream repo's already-shipped `.cycle/prompts/`.

## Requirements
- `src/defaults/prompts/spec.md` must instruct that every SPEC opens with a clearly-headed, mandatory block answering **WHY** (problem/motivation), **CONCRETE USER BENEFIT** (an observable, end-to-end thing a user can DO or OBSERVE that they couldn't before — explicitly NOT "code compiles / tests pass / endpoint returns X"), and **USABLE END-STATE** (what "done" looks like from the user's point of view).
- The spec prompt must define a **SCAFFOLDING ESCAPE HATCH**: if a round is genuinely foundational with no direct user benefit yet, the SPEC must say so explicitly, name the user benefit it unlocks, and name the later round that delivers it.
- The spec prompt must require at least one acceptance criterion phrased as the user-observable benefit (or, for flagged scaffolding, the concrete capability the next round builds on) — not solely mechanics. This must compose with, not replace, the existing failure-path acceptance-criterion mandate.
- `src/defaults/prompts/review.md` must instruct the reviewer to verify the work actually delivers the SPEC's stated user benefit (or that the scaffolding flag is honest and the unlocked capability is genuinely present); a benefit a user could not actually realize is a MUST-FIX written to MUST-FIX.md, not a pass.
- Both prompts must stay agent-agnostic and concise — no references to a specific agent CLI, no new tooling assumptions.
- After editing `src/defaults/`, `npm run sync-defaults` must be run so `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` sources.
- **Failure behavior**: This is a prompt-text + test change with no runtime code path, so the deliverable has no live failure surface (no bad input, dependency, or partial operation to handle at execution time). The corresponding failure guards are enforced at the test layer instead: if `src/defaults/` and `.cycle/` drift, the byte-identical dogfood test fails loudly; if a future edit removes one of the new mandates, the corresponding prompt-shape assertion fails. No error is swallowed — drift or a missing mandate surfaces as a failed test, not a silent pass.

## Acceptance Criteria
- [ ] `src/defaults/prompts/spec.md` contains a mandatory opening-block instruction naming all four of: WHY, CONCRETE USER BENEFIT, USABLE END-STATE, SCAFFOLDING ESCAPE HATCH.
- [ ] `src/defaults/prompts/spec.md` requires at least one acceptance criterion phrased as the user-observable benefit (distinct from the existing failure-path criterion mandate).
- [ ] `src/defaults/prompts/review.md` instructs that an undeliverable user benefit is a MUST-FIX (written to MUST-FIX.md), not a pass.
- [ ] **User-observable benefit**: a maintainer (or any future `spec`/`review` cycle) reading the freshly synced `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` finds the new user-benefit mandates present — i.e. running `cycle` now steers every spec toward a stated user benefit and every review toward verifying it, without any further engine work.
- [ ] **Failure-path / regression criterion**: `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` sources, and the prompt-shape tests fail if either new mandate is removed — verified by `npm test`.
- [ ] New/extended assertions exist in `tests/defaults/spec-prompt-ac.test.ts` and `tests/defaults/review-prompt-spec-ac.test.ts` covering the WHY/benefit/end-state/scaffolding mandates and the benefit-delivery MUST-FIX rule.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Test framework: `node:test` with `node:assert/strict`, matching the existing `tests/defaults/*.test.ts` style (read the prompt file, assert on substring/regex presence).
- Happy path: assert each new mandate string is present in `src/defaults/prompts/spec.md` (WHY, CONCRETE USER BENEFIT, USABLE END-STATE, SCAFFOLDING ESCAPE HATCH, user-benefit acceptance criterion) and in `src/defaults/prompts/review.md` (benefit-delivery verification ⇒ MUST-FIX).
- Regression / drift (failure path): assert `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` sources (the dogfood-copy invariant already present for spec.md; add the equivalent for review.md if absent).
- Edge case: confirm the new spec-prompt assertions do not collide with or weaken the existing Acceptance Criteria / failure-path / File Artifact Mode assertions — both old and new tests pass together.
- No UI change; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command or convention change is required by this cycle; the `npm run sync-defaults` convention is already documented. If a prompt-content invariant is asserted by a new test, no CLAUDE.md edit is needed beyond what already describes the defaults-sync flow. State explicitly in BUILD/FIX notes if no doc change was warranted.
- **README.md**: No user-facing CLI surface changes; no README edit required.

Documentation is part of "done" — if any contributor-facing convention is altered, update CLAUDE.md in the same cycle; otherwise record that no doc change was warranted.

## Dependencies
- Existing default prompts `src/defaults/prompts/spec.md` and `src/defaults/prompts/review.md`.
- The `npm run sync-defaults` script (copies `src/defaults/` → `.cycle/`), already present.
- The existing prompt-shape test files under `tests/defaults/` and the `node:test` harness.
- No external services or environment variables required.
