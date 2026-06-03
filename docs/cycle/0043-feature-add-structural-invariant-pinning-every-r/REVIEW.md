All gates green: 1076/1076 tests pass, coverage floors hold (`structural-invariants.mjs` 94.81% ≥ 90%), typecheck clean, `check:invariants` exit 0 with the new `5 paired` line. `src/cli.ts` is byte-identical to HEAD (no runtime change). Producing the review.

# Review: Cycle 0043

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers evaluated: no code-quality defects, no coverage regression (floors held; `scripts/structural-invariants.mjs` 94.81% ≥ 90%), no missing SPEC requirement, the user benefit is delivered end-to-end, no unbacked doc claim, SPEC has a populated `## Acceptance Criteria`, no swallowed/silent errors (the predicate-throw and malformed-entry paths fail loud), no fail-open default, the predicate is pure/idempotent, and PLAN.md carries a complete `## SPEC Acceptance Traceability` section. One non-blocking test-quality observation is recorded below.

## Code Quality Review

### Summary
A tightly-scoped, well-executed build-gate hardening. The driver in `scripts/structural-invariants.mjs` gains a clean two-kind dispatch (count-based vs. relational `validate`), the new `validateResidueArmPersist` predicate correctly pins all five paired arms while structurally whitelisting the `failingStep: undefined` tail-derived site, and no residue-guard runtime code was touched (`src/cli.ts` is byte-identical to HEAD).

### Findings
1. **Error containment (fail-loud, good)**: a thrown predicate is caught and converted to a `FAIL` with the error message, never a silent pass — `scripts/structural-invariants.mjs:200-204`. An entry with neither `pattern` nor `validate` is a `FAIL` — `scripts/structural-invariants.mjs:223-228`. The read-error `exit 2` path is preserved ahead of dispatch — `scripts/structural-invariants.mjs:189-192`.
2. **Whitelist is structural, not positional (matches SPEC)**: keyed on `/failingStep:\s*undefined/`, not a line number — `scripts/structural-invariants.mjs:32,144`. Survives line drift.
3. **Clear sites correctly excluded**: `ARM_NOT_CLEAR` guards against `= undefined` so the six `pendingResidueContext = undefined;` clear sites are never treated as arms — `scripts/structural-invariants.mjs:30,142`.
4. **Comment-tolerant lookahead**: `SKIPPABLE` skips comment/blank lines and stops at the first code line, so an unrelated distant persist can't false-pair — `scripts/structural-invariants.mjs:33,146-148`.
5. **No runtime change confirmed**: `git diff HEAD -- src/cli.ts` is empty; arming sites at `src/cli.ts:650,670,801,858,873,886` and persists at `671,802,859,874,887` are untouched (the `3 +` in the range diff is cycle 0042, already committed).
6. **Idempotency**: the predicate is pure string analysis over file contents — no I/O, no state, safe to re-run.

### Spec Compliance Checklist
- [x] Relational/predicate invariant kind added alongside count-based, no existing entry broken (`scripts/structural-invariants.mjs:194-228`; all prior `ok` lines emit unchanged)
- [x] One new `INVARIANTS` entry pins every non-whitelisted arm to a following `await persistResidue` with the tail-derived site whitelisted (`scripts/structural-invariants.mjs:99-105`)
- [x] Passes on the current tree — `ok … : 5 paired` (verified via `npm run check:invariants`, exit 0)
- [x] Deleting a persist / adding an un-paired arm fails with a named line + arm/persist contract (violation fixture test, exit 1)
- [x] Whitelist honored even when un-persisted (clean + violation fixtures both carry the un-persisted `failingStep: undefined` arm and only the genuine violation trips)
- [x] Failure message names the offending `src/cli.ts` line and the remediation (`scripts/structural-invariants.mjs:152,157-163`)
- [x] Thrown/malformed predicate surfaces as FAIL, read-error `exit 2` preserved
- [x] Coverage policy met — `scripts/structural-invariants.mjs` 94.81% ≥ 90% floor
- [x] `npm test` (1076/1076) and `npm run typecheck` clean
- [x] Docs updated (CLAUDE.md *Structural-invariants policy* + residue paragraph; docs/ENGINE.md new build-time-enforcement note); README correctly unchanged (internal build-gate hardening)

## Adversarial Test Review

### Summary
Adequate-to-strong. The behavioral surface is exercised against the **real** script via temp-dir fixtures (clean → `2 paired`/exit 0; violation → exit 1 naming `src/cli.ts`/`line N`/`persistResidue`; real-repo → `5 paired`), matching the established anti-mock spawn pattern. One nuance worth recording (below), not blocking.

### Findings
1. **Probe-replica for containment branches (informational)** — `tests/scripts/structural-invariants.test.ts:140-187`. The predicate-throw and malformed-entry containment is verified against a hand-written re-implementation of the driver loop in a temp `probe.mjs`, not against the real `scripts/structural-invariants.mjs`. Consequently the real script's `catch`/`continue` (`scripts/structural-invariants.mjs:200-204`) and malformed-entry `else` (`224-228`) are uncovered (the LCOV report flags `201-204 224-228`). The falsy-result branch (`205-209`) *is* covered by the real violation fixture. Impact is bounded: the real branches are four trivially-correct lines and the floor holds at 94.81% — but a future edit removing the real try/catch would not fail any test nor drop below the 90% floor. The probe faithfully mirrors the real logic, so this is a regression-guard gap on a safety branch, not a correctness defect. No fix required for this cycle's acceptance; if revisited, the clean path is to export the dispatch as `runInvariants(invariants, cwd)` and drive a throwing/malformed entry through the real function.
2. **Assertion quality (strong)** — specific matches on exit code, `src/cli.ts`, `/residue arm\/persist/`, `/persistResidue/`, `/line \d+/`, and the exact `: N paired` counts; no weak truthiness assertions.
3. **Test independence (good)** — each test uses its own `mkdtemp` root with `rm` in `finally`; no shared state or ordering dependence.
4. **Boundary coverage (good)** — comment-separated arm→persist, multiple arms in one file, clear sites, and the whitelisted-but-un-persisted arm are all distinct fixture cases.

### Test Coverage
- Command run: `npm run test:coverage`
- Suite: 1076 tests, 1076 pass, 0 fail
- `scripts/structural-invariants.mjs`: 94.81% line / 84.00% branch / 100.00% function (floor 90% — held)
- Regressions vs base (per-file): none (all `coverage-gate: ok`; runtime sources untouched)
- New code without tests: the real script's predicate-throw (`201-204`) and malformed-entry (`224-228`) branches are exercised only via the probe replica, not the real module (read-error `190-192` was already uncovered pre-cycle)
- Specific scenarios missing tests: direct (real-module) coverage of the thrown-predicate and malformed-entry containment paths

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| relational `{ file, validate, reason }` where `validate(text, file)` returns `{ ok, actual?, message? }` | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:194,205,211` | OK |
| "A thrown predicate is contained as a `FAIL`, never coerced to a silent pass" | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:200-203` | OK |
| "an entry with neither `pattern` nor `validate` is a `FAIL`" | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:223-227` | OK |
| residue arm→persist correspondence enforced by one relational entry | `CLAUDE.md:57`, `CLAUDE.md:128` | `scripts/structural-invariants.mjs:99-105` | OK |
| "any non-whitelisted `pendingResidueContext = { … }` arm … not immediately followed by `await persistResidue(...)`" fails the build | `docs/ENGINE.md:72` | `scripts/structural-invariants.mjs:138-154` | OK |
| tail-derived arm (`failingStep: undefined`, around `src/cli.ts:650`) structurally whitelisted | `CLAUDE.md:128`, `docs/ENGINE.md:72` | `scripts/structural-invariants.mjs:32,144`; `src/cli.ts:650` | OK |
| "On the current tree the entry reports `5 paired`" | `docs/ENGINE.md:72` | `check:invariants` stdout `… : 5 paired` (exit 0); `src/cli.ts:670/801/858/873/886` ↔ `671/802/859/874/887` | OK |
| "run inside `npm test`" via `npm run check:invariants` | `docs/ENGINE.md:72` | `test:coverage` tail runs `node scripts/structural-invariants.mjs` | OK |

All in-scope documentation prose (CLAUDE.md, docs/ENGINE.md) is backed; docs/cycle/* is out of scope per the pass rules.
