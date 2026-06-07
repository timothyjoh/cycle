# SPEC — Cycle 0267: Structural invariant guarding exec-lane active-child registration

## WHY
Cycle 0265 closed an orphan-process leak on suspend: every in-process step lane that spawns a child (`src/engine/exec-spawn.ts`, `src/engine/exec-bash.ts`) now registers its group-leader PID with the `active-child` registry (`registerActiveChild`/`unregisterActiveChild`) so `run-one`'s signal handler can reap it. This pairing is entirely manual and currently ungated. CLAUDE.md already documents that agent-fleet consistency across `exec-*.ts` is unguarded — a future agent lane that spawns a child but forgets to register/unregister it (or omits `detached: true`) would silently reintroduce the orphaned-mutating-process bug 0265 eliminated, with no test or build gate catching the regression.

## CONCRETE USER BENEFIT
A maintainer who adds a new spawning `exec-*.ts` lane and forgets the `registerActiveChild`/`unregisterActiveChild` pairing gets a loud, named build failure from `npm run check:invariants` — naming the offending file and the missing call — instead of a silently-shipped orphan-process leak that only surfaces as runaway repo-mutating processes after an operator "pause". The safety-critical convention becomes enforced rather than remembered.

## USABLE END-STATE
Running `npm run check:invariants` (and therefore `npm test`) fails with a clear `structural-invariants: FAIL <file> -- <reason>` message if any `src/engine/exec-*.ts` file calls `spawn(` without also calling both `registerActiveChild` and `unregisterActiveChild`. With the current tree (where both spawning lanes are correctly paired) the gate passes. A new spawning lane that omits either registry call cannot reach `master` green.

## Objective
Add one relational/predicate (`validate`-style) entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` that asserts every `src/engine/exec-*.ts` lane calling `spawn(` also calls both `registerActiveChild` and `unregisterActiveChild`. Reuse the existing `runInvariants` dispatch and the in-process test harness (`tests/scripts/structural-invariants.test.ts`) to cover the pass and fail branches. No exec-lane runtime behavior changes.

## Source Issue
`refl-0265-guard-exec-lane-active-child-registratio` — "Guard exec-lane active-child registration with a structural invariant"

## Scope

### In Scope
- A single new relational `INVARIANTS` entry (with a named `validate` predicate function) in `scripts/structural-invariants.mjs` that, for each spawning `src/engine/exec-*.ts` lane, requires both `registerActiveChild` and `unregisterActiveChild` to be present; a lane with no `spawn(` call passes vacuously.
- In-process test coverage in `tests/scripts/structural-invariants.test.ts` exercising both the pass branch (a lane that spawns and registers/unregisters) and the fail branch (a lane that spawns but is missing a registry call), driving the real `validate` predicate / `runInvariants`.
- A one-line update to the relevant CLAUDE.md note acknowledging the exec-lane active-child registration is now structurally guarded.

### Out of Scope
- Any change to exec-lane runtime behavior (`exec-spawn.ts`, `exec-bash.ts`, or any `exec-*.ts`).
- Asserting `detached: true` presence — the issue mentions it parenthetically, but the minimal, robust structural check is the register/unregister pairing; `detached` enforcement is deferred.
- The agent-fleet consistency invariant (REGISTRY ↔ `Step.agent` union ↔ `exec-*.ts`) noted as unguarded in CLAUDE.md — a separate concern.
- Any new dispatch machinery; reuse `runInvariants` as-is.

## Requirements
- The new entry is a relational (`validate`-style) `INVARIANTS` member following the existing shape (`{ file, validate, reason }` with a named predicate, mirroring `validateResidueArmPersist`). The predicate returns `{ ok, actual?, message? }`.
- The predicate is keyed to the exec-lane file set. It must treat a file that does not call `spawn(` as a pass (vacuous), and a file that calls `spawn(` but lacks `registerActiveChild` **or** `unregisterActiveChild` as a fail, with a `message` naming the file and the missing call(s).
- The check must remain import-safe and run only through `runInvariants` — no top-level side effects, no `process.exit` outside the existing `import.meta` CLI main guard.
- The predicate must be minimal and structural (string/regex presence), consistent with the project's agnostic / simple / resilient / fail-loud principles.
- **Failure behavior**: A thrown predicate must be contained by the existing `runInvariants` dispatch as a `FAIL` (never coerced to a silent pass) — this is already the dispatch contract; the new predicate must not defeat it. If a target `exec-*.ts` file is unreadable, the existing per-file read in the gate surfaces the error rather than passing silently. The predicate itself raises no unhandled error on well-formed input and returns a structured `{ ok: false, message }` (not a throw) for the genuine missing-call case so the operator sees the actionable name.

## Acceptance Criteria
- [ ] With the current repo tree, `npm run check:invariants` exits 0 (both spawning lanes are correctly paired, so the new invariant passes).
- [ ] **(User-observable benefit)** A test feeds the new predicate a synthetic lane containing `spawn(` but missing `unregisterActiveChild` and asserts the predicate returns `{ ok: false }` with a `message` naming the file and the missing call — demonstrating the build now catches the regression a maintainer would otherwise ship silently.
- [ ] **(Failure-path)** A test asserts that when the predicate is driven through `runInvariants` against a fixture/synthetic lane missing a registry call, `runInvariants` returns a non-zero failure count and emits the `structural-invariants: FAIL <file> -- <reason>` line, leaving no other invariant's result altered.
- [ ] A test asserts a lane with no `spawn(` call (and no registry calls) passes the predicate vacuously (`{ ok: true }`).
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean; the `.mjs` JSDoc remains type-checked under `// @ts-check` + `allowJs`).

## Testing Strategy
- Node's built-in `node:test` harness, matching `tests/scripts/structural-invariants.test.ts` conventions.
- Drive the **real** exported predicate and `runInvariants(INVARIANTS, cwd)` in-process (no script spawn), as the existing tests do.
- Key scenarios: happy path (spawn + both registry calls → pass), failure path (spawn + missing `register`/`unregister` → fail with named message), vacuous path (no `spawn(` → pass), and the dispatch-level integration showing a non-zero failure count + the `FAIL` line.
- Use synthetic in-memory text and/or a temp-dir fixture so the fail branch is exercised without mutating real `exec-*.ts` files. No UI; no E2E required.

## Documentation Updates
- **CLAUDE.md**: Update the *Structural-invariants policy* note (and/or the agent-fleet consistency caveat) to record that exec-lane active-child registration (`registerActiveChild`/`unregisterActiveChild` pairing for any `spawn(`-ing lane) is now machine-checked by a relational `INVARIANTS` entry.
- **README.md**: No user-facing surface change; the invariant is a build-time developer guard — no README update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `scripts/structural-invariants.mjs` with the `INVARIANTS` table, the `runInvariants(invariants, cwd)` export, and the `import.meta` CLI main guard (all present).
- Existing in-process test harness `tests/scripts/structural-invariants.test.ts`.
- The `active-child` registry contract (`registerActiveChild`/`unregisterActiveChild` in `src/engine/active-child.ts`) and its current callers `src/engine/exec-spawn.ts` and `src/engine/exec-bash.ts` (the known-good state the invariant must pass against).
- No external services or env vars.
