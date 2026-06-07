## Summary

Added a relational structural invariant that machine-enforces the cycle-0265 orphan-reap convention: any `src/engine/exec-*.ts` lane calling `spawn(` must also call both `registerActiveChild` and `unregisterActiveChild`. Implements all three PLAN.md tasks.

**`scripts/structural-invariants.mjs`** (+52 lines) — Task 1 complete. Added three `\b`-anchored module-level regex constants (`SPAWN_CALL`, `REGISTER_CHILD`, `UNREGISTER_CHILD`) next to the existing residue constants; added the exported pure predicate `validateActiveChildRegistration(text, file)` (mirroring `validateResidueArmPersist`'s JSDoc + `{ ok, actual?, message? }` shape) with three branches — vacuous-pass (no `spawn(`), paired-pass (`spawn(` + both calls), and a named `{ ok:false, message }` fail (does not throw) listing each missing call and the file; and registered it as one relational `INVARIANTS` entry per current exec lane via a `.map` spread over all 8 lanes (`exec-spawn`, `exec-bash` + the 6 agent lanes, excluding type-only `exec-types.ts`).

**`tests/scripts/structural-invariants.test.ts`** (+94 lines) — Task 2 complete. Imported the real predicate; extended `setup` to write passing `exec-spawn.ts`/`exec-bash.ts` stubs (`spawn(` + both registry calls) so the new per-lane entries don't `cannot read` against the synthetic tree; added 7 tests — vacuous pass, paired pass, missing-`unregisterActiveChild` fail (asserts message names file + call), the `\b` anchor guard (only `unregisterActiveChild(` present → fail lists `registerActiveChild`), `spawnSync(`-only vacuous pass, the dispatch-level failure-path test (synthetic temp-dir `exec-spawn.ts` missing a registry call → `runInvariants([entry], root) >= 1` + a captured `FAIL` line naming the lane and `unregisterActiveChild`), and a real-repo pass pin.

**`CLAUDE.md`** (+4/-3 lines) — Task 3 complete. Recorded the new invariant in the *Structural-invariants policy* paragraph and added clause (c) to the agent-add checklist (register an active-child-registration entry + pair the calls for any new spawning lane). No stale "unguarded" claim remains for this convention.

**Tests run:** `npm run test:coverage` (full suite + coverage + `check:coverage` + `check:invariants`) — **1169 tests, 1169 pass, 0 fail**. The structural-invariants gate (`node scripts/structural-invariants.mjs`) exits 0, emitting one `ok -- … active-child registration …` line per exec lane (paired for the two spawners, `no spawn( — vacuous` for the six agent lanes). `npm run typecheck` clean (predicate matches the `Invariant.validate` JSDoc typedef under `// @ts-check` + `allowJs`).

**Coverage:** `npm run test:coverage` → `check:coverage` exits 0, all per-file floors met; `scripts/structural-invariants.mjs` at **97.57% line ≥ 90% floor** (the predicate's three branches are each exercised by direct unit tests plus the live vacuous/paired production paths). No per-file regression — the change is additive (new predicate + tests + one doc note), touching no runtime engine path.

**Failure modes handled:** the predicate **returns** (never throws) a named `{ ok:false, message }` for the genuine missing-call case so the operator sees the actionable file + call; non-global (`\b`-anchored) regexes carry no `lastIndex` state across the per-lane reuse (idempotent); `spawnSync(` is excluded from the `spawn(` probe and `unregisterActiveChild` from the `registerActiveChild` probe (both real substring traps), covered by the anchor-guard and `spawnSync`-only tests; the existing `runInvariants` throw-containment and unreadable-file (`exitCode = 2`) paths are preserved unchanged — the predicate does not defeat them. The failure-path is covered by the dispatch-integration test asserting a non-zero failure count + a `FAIL` line.

**Deviations from PLAN.md:** none.

**Deferred / follow-up:** `detached: true` enforcement (out of scope per SPEC) and auto-globbing the exec-lane file set (the dispatch reads one fixed file per entry; a new lane is covered by adding its entry, captured in the CLAUDE.md agent-add checklist) remain deferred as planned.

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- CLAUDE.md
- docs/ENGINE.md
