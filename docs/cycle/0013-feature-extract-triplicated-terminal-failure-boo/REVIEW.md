# Review: Cycle 0013

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, faithful pure refactor exactly as specified. The triplicated terminal-failure bookkeeping in `src/cli.ts` is now a single exported `recordTerminalFailure` helper in `src/engine/halt-accounting.ts`, routed through all three in-scope branches; control flow (`break`, `halted`/`haltReason`/`activeCycleId`, `terminalDrain`, the fast-bail `step.warning`) stays visible at each call site, and the out-of-scope copies are untouched. Semantics are preserved byte-for-byte; all gates are green.

### Findings
1. **Purity / fail-safe**: `recordTerminalFailure` is referentially transparent — no I/O, no mutation of inputs (`failedCycles` returned as `[...prev, opts.cycleId]`, verified against a frozen array) — `src/engine/halt-accounting.ts:34-43`. No failure surface to swallow; nothing fail-open.
2. **Control flow not hidden**: the helper returns `{ halt }` and the caller acts on `acct.halt` to set halt fields and `break` — `src/cli.ts:534-541`, `587-594`, `607-614`. Matches the `advanceFastFailCounter` precedent.
3. **Array-aliasing risk closed**: original `failedCycles.push(...)` replaced with reassignment `failedCycles = acct.failedCycles`; `failedCycles` is a `let` (`src/cli.ts:210`) and the only other writers reassign (`src/cli.ts:436`) or are the out-of-scope resume copy (`src/cli.ts:441`). The single live reference is read at the post-loop `engine.halted` guard (`src/cli.ts:623`). No stale alias.
4. **Scope discipline**: resume-block copy (`src/cli.ts:439-446`, no fast-fail reset / no inline break), success reset, retry-drain, and triage halt all left unchanged, as SPEC requires.
5. **No swallowed/silent errors, no fail-open defaults**: no new `try/catch`; `terminalDrain`/`log.emit` rejection propagation is unchanged; in-process bookkeeping is guarded by the existing PID lockfile (idempotency preserved).

### Spec Compliance Checklist
- [x] Exactly one implementation of the bookkeeping sequence; three branches invoke it — `src/engine/halt-accounting.ts:26`, `src/cli.ts:531/584/604`
- [x] Helper returns a decision, does not `break`/`return`/exit the loop — `src/engine/halt-accounting.ts:37-43`
- [x] All five mutated fields + threshold check semantically identical across sites
- [x] `lastHaltContext` per-path correctness: commit uses `"commit"`, fast-bail/budget use resolved `failingStep` — `src/cli.ts:533/586/606`
- [x] `engine.halted` payload and `terminalDrain` signature unchanged (out of scope, untouched)
- [x] `npm run typecheck` clean; `npm run test:coverage` passes; `src/cli/run-one.ts` 73.96% ≥ 70%; new file 100% ≥ 100%; no aggregate regression
- [x] SPEC has a non-empty `## Acceptance Criteria` section with testable bullets
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet verbatim and pairing each with a covering task
- [x] CLAUDE.md updated (Architecture note + per-file floor entry)

## Adversarial Test Review

### Summary
Strong. Tests target the pure helper directly with real inputs (zero mocking — the anti-mock bias is fully satisfied), cover every per-path and boundary case the SPEC enumerates, and use specific `deepEqual`/`equal` assertions rather than truthiness checks. End-to-end exactly-once `engine.halted` cardinality remains pinned by the unchanged subprocess-integration suites.

### Findings
1. **Boundary coverage**: threshold-2 first-call-no-halt / second-call-halt (`tests/engine/halt-accounting.test.ts:75-90`), below-threshold no-halt (`:92-99`), and threshold-1 immediate halt (`:101-108`) pin the `>=` boundary precisely.
2. **Immutability**: frozen-array input + distinct-reference assertion (`tests/engine/halt-accounting.test.ts:33-43`) directly guards the array-copy contract.
3. **Per-path field correctness**: `lastHaltContext` asserted for `"commit"`, resolved step, and `undefined` (`tests/engine/halt-accounting.test.ts:45-63`); `fastFail` reset asserted across all three step shapes (`:65-73`).
4. **Assertion quality**: all assertions are exact-value (`assert.equal`/`assert.deepEqual`); no weak truthiness checks.
5. **Test independence**: each `test()` constructs its own inputs; no shared mutable state or ordering dependency.
6. **Exactly-once preserved**: the helper's halt boundary is unit-pinned; the supervisor-level exactly-once `engine.halted` (`filter(...).length === 1`) assertions in `tests/cli/halt.test.ts` and `tests/cli/iteration-too-fast.test.ts` exercise the rewired call sites end-to-end and pass unchanged — a genuine integration guard, not a gap.

### Test Coverage
- Command run: `npm run test:coverage`
- Result: 824 tests, 824 pass, 0 fail; exit 0
- `src/engine/halt-accounting.ts`: line 100.00% / branch 100.00% / function 100.00%
- Regressions vs base (per-file): none (triage 99.75%, issue-lifecycle 100%, commit-cycle 99.55%, branch 99.42%, run-cycle 99.65%, queue 98.02%, run-one 73.96% — all ≥ floor)
- New code without tests: none
- Specific scenarios missing tests: none — every SPEC testing-strategy scenario (per-path deltas, threshold crossing, below-threshold continuation, `lastHaltContext` fields, fastFail reset, immutability) is covered

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "pure `recordTerminalFailure(prev, opts)`" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:26` | OK |
| "used by the `src/cli.ts` supervisor's commit-failure, fast-bail, and budget-exhausted branches" | `CLAUDE.md:81` | `src/cli.ts:531`, `:584`, `:604` | OK |
| "increment `consecutiveFailures`" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:35` | OK |
| "append `failedCycles` as a new array" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:36` | OK |
| "set `lastHaltContext`" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:40` | OK |
| "reset the fast-fail counter" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:41` | OK |
| "returning a `{ halt }` decision the caller acts on" | `CLAUDE.md:81` | `src/engine/halt-accounting.ts:42`; consumed `src/cli.ts:534` | OK |
| "`break`/`terminalDrain` stay at the call site" | `CLAUDE.md:81` | `src/cli.ts:530`(terminalDrain) / `:544`(break) | OK |
| "Owns the exported `HaltContext` type (imported back into `cli.ts`)" | `CLAUDE.md:81` | export `src/engine/halt-accounting.ts:4`; import `src/cli.ts:28` | OK |
| "`src/engine/halt-accounting.ts` (100%)" per-file floor | `CLAUDE.md:38` | `scripts/coverage-gate.mjs:27` | OK |

(The diff's `docs/cycle/issues/...` file move is out of Pass-3 scope per the `docs/cycle/*` exclusion.)
