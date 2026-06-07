# SPEC — Cycle 0275: Pin terminal verify step names with a structural invariant

## WHY

The degenerate-verification gate (cycle 0272) — the no-false-greens guard that flips a `verify`/`final_verify` bash step from a passing `0` exit to a retryable failure when it executed zero non-skipped tests — fires only when `step.name === "verify" || step.name === "final_verify"`, hardcoded literals at `src/engine/run-cycle.ts:960`. Nothing ties those literals to the actual step names in `src/defaults/workflows.yml`. If a future refactor renames the terminal bash verify step (e.g. to `verify_app`) or collapses `final_verify`, the gate matches nothing and goes **silently inert with zero signal** — itself a false-green vector, the exact failure class this gate exists to prevent.

## CONCRETE USER BENEFIT

A maintainer who renames a workflow's terminal verification bash step in `workflows.yml` to a name the gate does not recognize gets an immediate, loud build failure from `npm run check:invariants` that names the workflow and the offending step name — instead of a green build that has quietly disabled the no-false-greens verification gate. The guard now guards its own wiring.

## USABLE END-STATE

A maintainer can trust that the degenerate-verification gate stays wired to every default workflow's verification step. Renaming that step outside the gate's recognized set (`verify` / `final_verify`) fails `npm run check:invariants` with an actionable message; keeping it in lockstep passes. The recognized-name set and the invariant cannot drift apart, because the invariant derives the recognized set from the gate's own source rather than re-declaring it.

## Objective

Add a build-time structural invariant to `scripts/structural-invariants.mjs` that asserts every default workflow's terminal/verification bash step (a bash step whose `command` is `scripts/verify.sh`) is named one of the gate's recognized literals (`verify` / `final_verify`). The recognized set must be derived from the gate's source of truth (the `step.name` literals at `src/engine/run-cycle.ts`), not hand-mirrored, so a rename that would orphan the gate fails the build loudly instead of silently disabling verification. This closes a false-green vector in the engine's own self-hosting guarantees.

## Source Issue

`refl-0272-verify-gate-step-names-are-unguarded-aga` — "Pin terminal verify step names with a structural invariant so the degenerate-verification gate can't silently go inert"

## Scope

### In Scope

- A new relational/predicate `INVARIANTS` entry (`{ file, validate, reason }`) registered in `scripts/structural-invariants.mjs` that, for each workflow defined in `src/defaults/workflows.yml`, finds bash steps invoking `scripts/verify.sh` and fails if any such step's name is outside the gate's recognized set — with a message naming the workflow and the offending step name.
- A single, drift-proof source for the recognized-name set: the predicate derives the recognized names from the gate's own literals in `src/engine/run-cycle.ts` (parsed from the `step.name === "…"` comparison at the gate site), so no second hand-maintained mirror is introduced.
- Tests in `tests/scripts/structural-invariants.test.ts` that drive both the pass branch (current `workflows.yml`) and the fail branch (a fixture/inlined config whose verify step is renamed) in-process against the imported predicate, plus the thrown-predicate-is-contained-as-FAIL path.

### Out of Scope

- Changing the gate logic in `run-cycle.ts:960` or the recognized-name set itself (no new accepted step names).
- Changing any workflow step name in `workflows.yml`.
- Any change to the `verify.sh` script, `verify-counts.ts`, or the runtime behavior of the degenerate-verification gate.
- Replacing the YAML parse approach with a new dependency — reuse whatever `workflows.yml` reading the script already supports (text/regex extraction is acceptable, consistent with the existing relational entries).

## Requirements

- The invariant is registered in the `INVARIANTS` table in `scripts/structural-invariants.mjs` and enforced via `npm run check:invariants` (which runs automatically after `test:coverage`).
- It uses the existing relational/predicate mechanism (`{ file, validate, reason }` with `validate(text, file)` returning `{ ok, actual?, message? }`).
- It follows the established import-safe / containment conventions: the predicate is an exported function driven directly by the test; a thrown predicate is contained as a FAIL, never coerced to a silent pass.
- The recognized-name set is derived from `src/engine/run-cycle.ts` (the gate's literals), not re-typed in the invariant — if the gate's literals and the workflow step names diverge, the build fails.
- Scope the check to terminal/verification bash steps (`agent: bash` invoking `scripts/verify.sh`); workflows with no such step pass vacuously (e.g. document/quickfix/e2e-tests verify steps that match are covered; a workflow with no verify-script step is not penalized).
- **Failure behavior**: If `src/defaults/workflows.yml` or `src/engine/run-cycle.ts` cannot be read or parsed (missing file, no recognizable gate literals, malformed step list), the predicate must FAIL with an actionable message rather than passing — an inability to confirm the wiring is treated as a violation, consistent with the script's fail-closed containment convention. A renamed verify step produces a FAIL naming the workflow and the offending step name. Errors are surfaced through the invariant's `{ ok: false, message }` return (or a thrown error contained as FAIL) — never swallowed into a silent pass.

## Acceptance Criteria

- [ ] A structural invariant registered in `scripts/structural-invariants.mjs` asserts that each default workflow's terminal bash verify step (the `scripts/verify.sh` bash step) is named `verify` or `final_verify`; `npm run check:invariants` passes against the current `src/defaults/workflows.yml`.
- [ ] **(User-observable benefit)** Renaming the terminal verify step in a workflow to a name outside the gate's recognized set (e.g. `verify_app`) makes `npm run check:invariants` exit non-zero with a message naming the workflow and the offending step name — demonstrated by a test driving the predicate against such a config.
- [ ] **(Failure-path)** When the predicate is given input it cannot parse (e.g. `run-cycle.ts` source with no recognizable gate literals, or a `workflows.yml` with no resolvable verify step where one is expected), it returns `{ ok: false, message }` (or throws and is contained as a FAIL) rather than a silent pass — asserted in-process in `tests/scripts/structural-invariants.test.ts`.
- [ ] The recognized-name set used by the invariant is derived from the gate's literals in `src/engine/run-cycle.ts`, not independently re-declared in the invariant entry — verified by a test that changing the recognized literals (fixture) changes the predicate's accepted set.
- [ ] `tests/scripts/structural-invariants.test.ts` drives the new entry's pass branch and fail branch in-process via the exported predicate, keeping the coverage floor for `scripts/structural-invariants.mjs` green.
- [ ] The new invariant is documented in the structural-invariants section of `CLAUDE.md` (one line, consistent with the existing entries).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck`, `npm run check:invariants`, coverage gates all green).

## Testing Strategy

- **Framework**: `node:test` via `npm test`, mirroring the existing `tests/scripts/structural-invariants.test.ts`, which imports the real exported predicate/`INVARIANTS`/`runInvariants` from the `.mjs` (import-safe; the CLI gate runs only under the `import.meta` main guard).
- **Key scenarios**:
  - **Happy path**: the predicate returns `{ ok: true }` for the current `workflows.yml` + `run-cycle.ts` pair (every verify-script step is `verify`/`final_verify`).
  - **Fail path (rename)**: a config whose verify-script step is renamed to `verify_app` returns `{ ok: false }` with a message naming the workflow and step.
  - **Fail path (unparseable)**: `run-cycle.ts` text with no recognizable gate literals, or `workflows.yml` text that cannot be parsed for verify steps, yields a FAIL (not a pass).
  - **Containment**: a predicate that throws is surfaced as a FAIL through `runInvariants`, never a silent pass (drive the real containment branch in-process).
  - **Drift coupling**: a fixture changing the derived recognized literals changes which step names the predicate accepts, proving the set is derived rather than hardcoded.
- No UI changes; no E2E suite applies (cycle's own CLI repo is unit-only — see CLAUDE.md → *Core thesis*).

## Documentation Updates

- **CLAUDE.md**: Add one line to the structural-invariants section describing the new entry — that each default workflow's terminal bash verify step name is machine-checked to stay in lockstep with the degenerate-verification gate's recognized literals (`verify`/`final_verify`) so a rename fails the build instead of silently disabling the gate — consistent with the existing active-child-registration / detached-spawn entries.
- **README.md**: No user-facing change to surface (internal build-time invariant only).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- Existing `INVARIANTS` table and the relational/predicate (`{ file, validate, reason }`) mechanism in `scripts/structural-invariants.mjs`, plus its exported `runInvariants(invariants, cwd)` / `INVARIANTS` for in-process tests.
- The degenerate-verification gate literals at `src/engine/run-cycle.ts` (the `step.name === "verify" || step.name === "final_verify"` site, currently `:960`).
- `src/defaults/workflows.yml` as the source of default workflow step names.
- No external services or env vars required.
