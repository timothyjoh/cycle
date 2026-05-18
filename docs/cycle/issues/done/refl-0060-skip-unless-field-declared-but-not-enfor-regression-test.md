---
id: refl-0060-skip-unless-field-declared-but-not-enfor-regression-test
title: "Regression test: any step with skip_unless emits step.skipped when artifact absent"
workflow: quickfix
depends_on: [refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless]
triaged_at: "2026-05-14T22:06:06.979Z"
source: triage
parent: refl-0060-skip-unless-field-declared-but-not-enfor
---
## Context

`src/engine/workflow.ts:10` declares optional `skip_unless?: string` on the `Step` schema, and `.cycle/workflows.yml` uses it on the `fix` step (`skip_unless: MUST-FIX.md`). Today the runner in `src/engine/run-cycle.ts` does not read the field, so the fix agent runs unconditionally — wasting an agent call and producing a misleading FIX.md artifact. The cycle-0060 FIX.md called this out explicitly under "Reflection-worthy follow-ups" item 1.

Sister item [[refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless]] lands the runtime honoring of `skip_unless` for the fix step. This item adds a **schema-level regression test** that pins the contract for *any* future step that declares `skip_unless`, not just `fix`. As soon as a `docs` workflow (or anything else) lands a `skip_unless: DOC_DRIFT.md`, the same gap would multiply without this guard.

## Scope

Add one focused test under `tests/engine/` that:

1. Builds a minimal workflow with a synthetic step (`name: smoke`, `agent: bash`, `skip_unless: SENTINEL.md`).
2. Runs the cycle without pre-staging `<artifactDir>/SENTINEL.md`.
3. Asserts the log emits `step.skipped {reason: "skip_unless_absent", file: "SENTINEL.md"}` and no `step.end status: ok` for `smoke`.
4. Re-runs with `SENTINEL.md` pre-staged in `<artifactDir>` and asserts the step executes normally.

The test must be agent-agnostic (use a bash step or the stub runner) so it pins the engine's `skip_unless` enforcement, not any one agent's behavior.

## Out of scope

- The fix-step-specific behavior (covered by [[refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless]]).
- Pinning no FIX.md artifact emitted on skip (covered by [[refl-0054-fix-step-emits-skip-narration-to-fix-md-pin-no-fix-md-when-skipped]]).
- Removing `skip_unless` from the schema — explicitly rejected; the field is the intended mechanism.

## Acceptance

- New test file under `tests/engine/` lives next to existing run-cycle tests.
- Test fails on master before refl-0041 lands; passes after refl-0041 + this item.
- Coverage for `runStep` / step-loop in `src/engine/run-cycle.ts` covers the `skip_unless` branch.
