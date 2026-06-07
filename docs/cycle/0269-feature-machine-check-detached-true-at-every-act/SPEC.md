I have enough context. Computing artifact dir: `docs/cycle/0269-feature-machine-check-detached-true-at-active-ch/SPEC.md`.

```markdown
# SPEC — Cycle 0269: Machine-check `detached: true` at every active-child spawn site

## WHY
The reaper that kills a cycle's agent/bash subtree on an operator "pause"
(SIGTERM/SIGINT) targets the child's **process group** via the negated pid:
`killActiveChildren` group-kills with `process.kill(-pid, sig)`, and as of
cycle 0268 the fast-poll liveness probe `anyChildAlive` group-probes with
`process.kill(-pid, 0)`. Both are correct only because every registered active
child is spawned `detached: true`, which makes the child its own process-group
leader (so `-pid` names the child's group, not the worker's). That invariant is
honored at all current spawn sites and documented in CLAUDE.md, but it is **not
machine-checked**. The cycle-0267 structural invariant
(`validateActiveChildRegistration`) verifies only the
`registerActiveChild`/`unregisterActiveChild` pairing — a lane could register
its child correctly yet omit `detached: true`, pass the build, and silently
break both the reaper kill and the new liveness probe, reopening the
orphaned-grandchild window at suspend time.

## CONCRETE USER BENEFIT
A cycle operator who later adds (or modifies) an exec lane and forgets
`detached: true` while still registering the child gets a **loud build-time
failure** from `npm run check:invariants` naming the offending file — instead of
a silent regression that only manifests as an orphaned agent process still
mutating the repo after they hit "pause" in production. The suspend/resume
guarantee stays enforced by the build, not by reviewer vigilance.

## USABLE END-STATE
Running `npm run check:invariants` fails with an actionable message if any
`src/engine/exec-*.ts` lane that calls `spawn(` does not also pass
`detached: true` to that spawn. With the three current spawning lanes all
compliant, the check passes today; the moment a non-detached registered-child
spawn is introduced, the build breaks.

## Objective
Extend the build-time structural-invariants gate so the process-group reaping
contract (`detached: true` at every active-child spawn site) is enforced
mechanically, closing the gap between the documented invariant and what the gate
actually verifies. This cycle adds a new relational predicate, registers it per
exec lane alongside the existing active-child-registration entry, covers its
branches with tests, and updates the CLAUDE.md notes — no engine runtime
behavior changes.

## Source Issue
`refl-0268-machine-check-detached-true-at-active-ch` — "Machine-check detached:true at every active-child spawn site"

## Scope

### In Scope
- Add a new relational predicate `validateDetachedSpawn(text, file)` in
  `scripts/structural-invariants.mjs` that fails when a lane calls `spawn(` but
  does not also pass `detached: true`; a lane with no `spawn(` passes vacuously
  (mirroring `validateActiveChildRegistration`). Register it as one `INVARIANTS`
  entry per existing `exec-*.ts` lane, reusing the same per-lane list mechanism
  so a new lane is covered by adding its single entry.
- Cover the new predicate's branches (vacuous no-spawn pass, spawn-with-detached
  pass, spawn-without-detached fail) via in-process tests in
  `tests/scripts/structural-invariants.test.ts`, driving the real exported
  predicate per the import-safe module contract.
- Update CLAUDE.md's structural-invariants policy paragraph and the "adding an
  agent / new exec lane" note to record the new `detached: true` check alongside
  the active-child-registration entry.

### Out of Scope
- Any change to runtime reaper behavior (`killActiveChildren`,
  `anyChildAlive`, `active-child.ts`) — the spawn sites already comply; this
  cycle only adds a guard.
- Collapsing the per-lane `INVARIANTS` list into a glob/auto-discovery
  mechanism — the existing fixed-file-per-entry dispatch is preserved.
- Asserting `detached: true` on `spawnSync(` call sites — only the
  group-reaped, registered async `spawn(` children require it.

## Requirements
- The new predicate is an exported function in
  `scripts/structural-invariants.mjs` (so tests import the real implementation,
  no `.d.mts` mirror), annotated with the co-located JSDoc the module's
  `// @ts-check` + repo-wide `allowJs` type-checks.
- Detection uses anchored regexes consistent with the existing module
  (`\bspawn\s*\(` for the spawn probe; a `detached\s*:\s*true` probe for the
  option), so `spawnSync(` does not satisfy the spawn probe.
- The predicate returns a named `{ ok: false, message }` (never throws) for the
  genuine missing-`detached` case, with a message naming the file and the
  actionable remediation; a thrown predicate remains contained as a FAIL by the
  existing dispatch loop.
- A lane that calls `spawn(` with `detached: true` passes; a lane with no
  `spawn(` passes vacuously with a descriptive `actual` string.
- CLI behavior of `node scripts/structural-invariants.mjs` (exit 0/1/2,
  stdout/stderr format) is unchanged except for the additional check's pass/fail
  lines.
- **Failure behavior**: a registered-child lane that spawns without
  `detached: true` causes `npm run check:invariants` to print the predicate's
  named failure message (file + remediation) and exit non-zero — the violation
  surfaces loud, never silently passes. The predicate itself never throws on
  malformed lane text (no `spawn(` ⇒ vacuous pass); an unreadable target file is
  handled by the existing dispatch's tagged-error/exit-2 path, unchanged.

## Acceptance Criteria
- [ ] A new exported predicate in `scripts/structural-invariants.mjs` returns
      `{ ok: false }` for source text containing `spawn(` without
      `detached: true`, and `{ ok: true }` both for text containing
      `spawn(` with `detached: true` and for text containing no `spawn(`.
- [ ] The predicate is registered as one `INVARIANTS` entry for each existing
      `exec-*.ts` lane (the same per-lane list that carries
      `validateActiveChildRegistration`).
- [ ] **(user-observable benefit)** Running `npm run check:invariants` against
      the current tree exits 0; introducing a `spawn(` without `detached: true`
      in a registered-child lane makes it exit non-zero with a message naming
      the offending file — verified by an in-process test feeding such text to
      the predicate and asserting the failure.
- [ ] **(failure-path)** A test asserts the predicate returns
      `{ ok: false, message }` (and does not throw) for `spawn(`-without-detached
      text, and the message names the file and the `detached: true` remediation.
- [ ] `npm run typecheck` passes (the co-located JSDoc matches the new
      predicate's implementation).
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node's built-in test runner (`node --test`, `node:test` + `node:assert`), the
  repo's existing convention.
- Drive the real exported predicate in-process via
  `tests/scripts/structural-invariants.test.ts` (the module is import-safe — the
  gate runs only under the `import.meta` CLI main guard).
- Key scenarios:
  - **Happy path**: text with `spawn(... detached: true ...)` ⇒ `{ ok: true }`.
  - **Vacuous**: text with no `spawn(` ⇒ `{ ok: true }` with the no-spawn
    `actual` string.
  - **Failure path**: text with `spawn(` and no `detached: true` ⇒
    `{ ok: false }` with a message naming the file and remediation; assert it
    does not throw.
  - **Substring trap**: text with only `spawnSync(` does not trip the spawn
    probe (stays a vacuous pass), matching the existing
    `validateActiveChildRegistration` anchoring guarantee.
  - **Regression**: the existing `runInvariants(INVARIANTS, cwd)` /
    full-suite assertions still pass against the real repo (all three current
    spawning sites compliant).
- No UI changes — no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: In the structural-invariants policy paragraph and
  the "adding an agent / if the new exec lane spawns a child process" note,
  record that each spawning lane is now machine-checked for `detached: true`
  (alongside the cycle-0265/0267 active-child-registration entry), and that a
  new lane is covered by adding its per-lane entry.
- **README.md**: No user-facing CLI change — nothing to surface.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The import-safe structural-invariants module contract from cycle 0267
  (`runInvariants`/`INVARIANTS` exports, `validateActiveChildRegistration`
  predicate, per-lane entry list) — already present.
- `// @ts-check` + repo-wide `allowJs` for JSDoc type-checking of the `.mjs`
  — already configured.
- No external services or env vars.
```
