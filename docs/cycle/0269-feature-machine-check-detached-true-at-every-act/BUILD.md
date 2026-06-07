All gates pass: 1181 tests, coverage gate exit 0 (all per-file floors met, none regressed), structural-invariants exit 0.

## Summary

This cycle adds a build-time structural invariant that machine-checks the process-group reaping contract — every `src/engine/exec-*.ts` lane that calls `spawn(` must also pass `detached: true` — closing the gap between the documented invariant and what `npm run check:invariants` actually verifies. No engine runtime behavior changed; the three current spawning sites already comply.

### Files modified

- **`scripts/structural-invariants.mjs`** (+34 lines): added the anchored option probe `const DETACHED_TRUE = /detached\s*:\s*true/;` near the existing `SPAWN_CALL` declaration; added the exported relational predicate `validateDetachedSpawn(text, file)` (with co-located `@param`/`@returns` JSDoc) immediately after `validateActiveChildRegistration`, mirroring its exact shape — vacuous no-`spawn(` pass (`{ ok: true, actual: 'no spawn( — vacuous' }`), `spawn(`-with-`detached` pass (`{ ok: true, actual: 'spawn( with detached: true' }`), and `spawn(`-without-`detached` named failure (`{ ok: false, message }` naming the file + `detached: true` remediation, never throws); registered it as one `INVARIANTS` entry per the same 8 `exec-*` lanes via a second spread `.map` directly after the active-child `.map`.
- **`tests/scripts/structural-invariants.test.ts`** (+76 lines): imported `validateDetachedSpawn`; updated the shared `setup` helper's `exec-spawn`/`exec-bash` synthetic stubs to include `detached: true` in the `spawn(` call so the subprocess-driven clean-tree tests still pass against the new invariant; added 7 cases — happy path, vacuous no-`spawn(`, failure path (asserts `{ ok: false }`, `assert.doesNotThrow`, message names file + `detached: true`), `spawnSync(` substring trap, whitespace tolerance, a dispatch-level `runInvariants` fail against a synthetic non-detached lane (asserts return `1` + `FAIL` line via `captureConsoleError`), and a dispatch-level pass against the real `src/engine/exec-spawn.ts` (confirms file-level detection finds `detached: true` in the shared `base` object).
- **`CLAUDE.md`** (+2 edits): the structural-invariants policy paragraph now records the cycle-0269 `validateDetachedSpawn` machine-check (per-lane entries mirroring the active-child list, file-level detection, vacuous non-spawning lanes, per-lane-entry extension rule); the adding-an-agent `> Note:` item (c) now states a spawning lane must also pass `detached: true` and register its per-lane detached-spawn entry. `AGENTS.md` does not exist in-repo — no action taken.

### PLAN.md tasks complete

All three: Task 1 (predicate + per-lane registration), Task 2 (in-process branch tests), Task 3 (CLAUDE.md notes).

### Verification

- Full suite: `npm test` (via `npm run test:coverage`) → **1181 tests, 1181 pass, 0 fail**, full script chain exit 0.
- Coverage: `npm run test:coverage` (LCOV → `npm run check:coverage`) → **exit 0, every per-file floor met, none regressed** (e.g. `branch.ts` 99.42% ≥ 90%, `failed-residue-guard.ts` 100% ≥ 100%, `failed-cycle-teardown.ts` 85.27% ≥ 85%). Whole-repo node:test built-in reporter totals (include never-exercised files): line 46.44% / branch 88.77% / func 49.89% — not the policy gate; the LCOV per-file floor gate is the enforced policy and it passed. No per-file floor is declared for `structural-invariants.mjs`; the new predicate's every branch (vacuous / pass / fail / `spawnSync(` trap / whitespace) is exercised.
- `npm run typecheck` → exit 0 (co-located JSDoc matches the new predicate).
- `npm run check:invariants` → exit 0, with 8 new `detached-spawn` `ok` lines (`exec-spawn`/`exec-bash` report `spawn( with detached: true`; the 6 agent lanes report `no spawn( — vacuous`).

### Failure modes handled

- **Genuine missing-`detached` violation**: predicate returns a named `{ ok: false, message }` (file + `detached: true` remediation) surfaced by the dispatch loop as a `FAIL` line on `console.error` + exit 1 — never a silent pass. Covered by the failure-path predicate test and the dispatch-level `runInvariants` fail test.
- **Predicate throw (defensive)**: contained by the existing dispatch `try/catch` as a `FAIL`, unchanged.
- **`spawnSync(` substring trap**: the `\bspawn\s*\(` anchor excludes `spawnSync(`; covered by an explicit trap test.
- **`detached: true` in a shared options object, not on the `spawn(` line** (the `exec-spawn.ts` shape): file-level whole-text detection — covered by the dispatch-level pass test against the real file.
- **Idempotency**: the predicate is a pure deterministic function over `(text, file)`; the gate is a read-only file scan, safe to re-run byte-for-byte on engine retry.

### Deviations from PLAN.md

None. The plan's optional whitespace-tolerance test was included.

### Deferred work

None. `walkthrough.ts` is intentionally excluded (outside the `exec-*` scope per resolved open question 1) — it already complies and covering it would be scope creep.

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- CLAUDE.md
- docs/ENGINE.md
