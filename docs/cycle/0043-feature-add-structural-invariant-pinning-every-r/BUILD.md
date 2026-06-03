All quality gates pass. Writing the build summary.

## Summary

This cycle was implemented as a **resumed build**: the working tree already carried a complete, plan-conformant implementation, which I verified end-to-end against the SPEC acceptance criteria rather than re-authoring. All four PLAN.md tasks are complete.

**Task 1 — relational-entry dispatch + predicate containment** (`scripts/structural-invariants.mjs`, +99/−9 vs HEAD): the driver loop now branches on entry kind after the unchanged file read (read-error still `exit 2`). A `validate`-style entry is evaluated inside a `try/catch` that converts any throw to a `FAIL` line (`predicate threw: <msg>`, `failed++`, `continue`) so a malformed/erroring predicate can never be coerced to a silent pass; a falsy result FAILs with the predicate's message; an entry with neither `pattern` nor `validate` FAILs as `malformed invariant entry`. Existing count-based entries emit byte-identical `ok`/`FAIL` output. The header comment documents both entry kinds.

**Task 2 — residue arm/persist invariant** (same file): module-level predicate `validateResidueArmPersist` plus regexes (`ARM`, `ARM_NOT_CLEAR`, `WHITELIST` = `failingStep:\s*undefined`, `PERSIST`, `SKIPPABLE`). It scans `src/cli.ts` line-by-line, skips clear sites (`= undefined`) and the structurally-whitelisted tail-derived arm, looks ahead past comment/blank lines for the paired `await persistResidue(...)`, and returns `{ ok:false, message }` naming every offending `line N: <text>` with the arm/persist remediation, else `{ ok:true, actual: "N paired" }`. One `INVARIANTS` entry registers it against `src/cli.ts`; on the live tree it reports `5 paired` with the `src/cli.ts:650` whitelisted site untripped.

**Task 3 — fixtures + tests** (`tests/fixtures/structural-invariants/cli-residue-clean.ts` new, 19 lines; `cli-residue-violation.ts` new, 14 lines; `tests/scripts/structural-invariants.test.ts`, +84): clean fixture exercises whitelisted arm + adjacent paired arm + comment-separated paired arm + a clear site (`2 paired`); violation fixture pairs the whitelisted un-persisted arm with one genuine non-whitelisted un-paired arm. Both fixtures carry exactly one `consecutiveFailures += 1` and three `await haltIfResidue()` so only the residue invariant is under test. Three new spawned-script tests (clean→exit 0/`2 paired`; violation→exit 1 naming `src/cli.ts`/`line N`/`persistResidue`/the contract; real-repo→`5 paired` ok line) plus a self-contained probe test that drives the throwing-predicate and malformed-entry containment branches.

**Task 4 — docs**: CLAUDE.md *Structural-invariants policy* note now describes both count-based and relational/predicate entry kinds and the contained-throw posture; the residue-guard paragraph states the arm→persist pairing is machine-checked (cycle 0043) with the `failingStep: undefined` tail-derived site whitelisted, replacing the prose-only framing. docs/ENGINE.md (*Failed-cycle dirty-worktree residue guard*) gained a "Build-time enforcement of the arm→persist pairing (cycle 0043)" note documenting the predicate-invariant facility. README.md unchanged — this is internal build-gate hardening with no user-facing runtime change (stated per SPEC).

**Verification.** Full suite: `npm run test:coverage` (which chains `pretest` build → tests → `check:coverage` → `check:invariants`) exited **0**. `npm run typecheck` (`tsc --noEmit`) clean, no warnings. `npm run check:invariants` exits 0 and prints the new `ok -- src/cli.ts residue arm/persist correspondence …: 5 paired` line alongside every prior entry unchanged. The targeted `tests/scripts/structural-invariants.test.ts` suite: **9 tests, 9 pass, 0 fail**.

**Coverage.** `scripts/coverage-gate.mjs` reports `scripts/structural-invariants.mjs 94.81% ≥ 90%` floor held; `src/engine/failed-residue-guard.ts 100% ≥ 100%`. No runtime source was touched, so no per-file floor regressed; the full `check:coverage` gate passed inside the exit-0 `test:coverage` run. Line/branch/function suite totals were not separately re-derived because the LCOV-driven gate (the repo's enforced policy) passed clean — no floor decreased vs the base branch.

**Failure modes handled this cycle** (all build-gate, no runtime): predicate-throw containment (caught → `FAIL`, never silent pass — covered by the probe test's `predicate threw: boom` assertion); malformed-entry detection (no `pattern`/`validate` → `FAIL` — same probe test's `malformed invariant entry` assertion); un-paired arm violation (→ `{ ok:false }`, exit 1, named line — covered by the violation fixture test); whitelist honored for an un-persisted `failingStep: undefined` arm (asserted by both fixtures passing/failing only on the genuine violation); comment-tolerant lookahead (clean fixture's comment-separated pair); clear sites not matched as arms (clean fixture). The predicate is pure string analysis — idempotent, no I/O, safe to re-run; the read-error `exit 2` path is preserved (read precedes dispatch).

**Deviations from PLAN.md.** None substantive. The clean fixture's `ok` line reports `2 paired` (two genuine paired arms; the whitelisted site is correctly excluded from the count), and the test asserts exactly that — consistent with the predicate's design.

**Deferred / follow-up.** None. SPEC scope is fully met; no out-of-scope work was introduced (residue-guard runtime in `src/cli.ts`, `failed-residue-guard.ts`, and `residue-context-store.ts` is byte-for-byte unchanged).

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- tests/fixtures/structural-invariants/cli-residue-clean.ts
- tests/fixtures/structural-invariants/cli-residue-violation.ts
- CLAUDE.md
- docs/ENGINE.md
