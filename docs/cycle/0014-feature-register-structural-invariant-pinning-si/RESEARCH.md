# Research: Cycle 0014

## Cycle Context
SPEC.md for cycle 0014 asks to make the cycle-0013 de-duplication of terminal-failure bookkeeping self-enforcing. Cycle 0013 extracted the triplicated `consecutiveFailures += 1` / `failedCycles.push(...)` accounting from three supervisor branches in `src/cli.ts` into the single pure helper `recordTerminalFailure` (`src/engine/halt-accounting.ts`), but the de-duplication is currently convention-only. This cycle registers one new build-time structural invariant in `scripts/structural-invariants.mjs` that pins the count of the inlined bookkeeping mutation in `src/cli.ts` to exactly its single legitimate occurrence (the resume block), so that re-inlining the accounting at any of the three delegating call sites fails `npm run check:invariants` (exit 1). It also extends `tests/scripts/structural-invariants.test.ts` with violation + clean fixtures and preserves the existing real-repo regression-pin test. Scope is confined to the checker script and tests/fixtures; no production engine source is modified.

## Current Codebase State

### Relevant Components
- Structural-invariants checker: reads each `INVARIANTS` entry's target file, counts global-regex matches, fails on count mismatch — `scripts/structural-invariants.mjs:1-59`
- `INVARIANTS` table (single source of truth, 4 current entries: two `triage.ts`, one `src/cli.ts` `commit-scope-guard-loop` rule with `expected: 0`, one `commit-cycle.ts` rule) — `scripts/structural-invariants.mjs:12-37`
- Checker loop + exit-code semantics (exit 0 all-pass, exit 1 any-fail, exit 2 unreadable target) — `scripts/structural-invariants.mjs:39-59`
- Existing test suite for the checker (violation, clean, real-repo regression-pin) — `tests/scripts/structural-invariants.test.ts:1-55`
- Fixture files for the existing triage rule — `tests/fixtures/structural-invariants/triage-violation.ts`, `tests/fixtures/structural-invariants/triage-clean.ts`
- The sole sanctioned inlined bookkeeping occurrence (resume block) — `src/cli.ts:439-447`
- The three delegating `recordTerminalFailure` call sites (commit-failure, fast-bail, budget-exhausted) — `src/cli.ts:531-545`, `src/cli.ts:584-598`, `src/cli.ts:604-618`
- The single helper implementation (functional, non-mutating form) — `src/engine/halt-accounting.ts:26-44`

### Existing Patterns to Follow
- **Per-file regex-count invariant entry**: each `INVARIANTS` element is `{ file, pattern (global regex), expected (number), reason (string) }`. The checker compares `(text.match(pattern) ?? []).length` against `expected`. The SPEC mandates reusing this exact posture (no AST, no multi-file rules) — `scripts/structural-invariants.mjs:12-48`
- **`expected: 0` precedent for "this must NOT appear"**: the existing `commit-scope-guard-loop` rule on `src/cli.ts` pins to zero (`scripts/structural-invariants.mjs:26-30`). The new rule instead pins to the current positive occurrence count (the resume block).
- **Pass/fail line format**: on pass, stdout gets `structural-invariants: ok -- ${file} ${reason}: ${actual}` (`scripts/structural-invariants.mjs:55`); on fail, stderr gets `structural-invariants: FAIL ${file} -- ${reason}: expected ${expected}, got ${actual}` (`scripts/structural-invariants.mjs:50-52`). The SPEC's required failure-line substrings (`src/cli.ts`, reason, `expected … got …`) map directly to this format.
- **`reason` naming convention**: short descriptive phrases, sometimes referencing the originating cycle (e.g. `commit-scope-guard-loop halt path removed in cycle 0227`) — `scripts/structural-invariants.mjs:29,35`.
- **Regex disambiguation requirement**: within `src/cli.ts`, the inlined form is `consecutiveFailures += 1;` (`src/cli.ts:440`) and `failedCycles.push(tail.cycleId);` (`src/cli.ts:441`). The delegating sites use assignment instead — `consecutiveFailures = acct.consecutiveFailures;` / `failedCycles = acct.failedCycles;` (`src/cli.ts:535-536`, `588-589`, `608-609`). The functional non-mutating form (`prev.consecutiveFailures + 1`, `[...prev.failedCycles, opts.cycleId]`) lives only in `src/engine/halt-accounting.ts:35-36`, which is NOT scanned by a `src/cli.ts`-targeted rule. A pattern anchored on `+= 1` or `.push(` therefore matches the resume block only.
- **Test harness pattern**: spawn the checker via `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })` against a temp dir built by a `setup(cwd, content)` helper that writes the stub source tree (`tests/scripts/structural-invariants.test.ts:11-20`). The current `setup` writes only `"// stub"` for `src/cli.ts` (`tests/scripts/structural-invariants.test.ts:14`); SPEC requires making `src/cli.ts` content controllable (extend `setup` or add a parallel helper).
- **Temp-dir lifecycle**: `mkdtemp(join(tmpdir(), "cycle-si-…"))` in a `try` with `rm(root, { recursive: true, force: true })` in `finally` — `tests/scripts/structural-invariants.test.ts:23-35`, `40-48`.
- **Fixture-file vs inline content**: existing rule uses fixture files read via `readFile(join(FIXTURES, …), "utf8")` (`tests/scripts/structural-invariants.test.ts:25,41`); SPEC allows either inline strings or new fixture files under `tests/fixtures/structural-invariants/`.
- Failure handling: the checker itself has two failure paths — unreadable target file ⇒ `console.error` + `process.exit(2)` (`scripts/structural-invariants.mjs:42-47`); count mismatch ⇒ `console.error` + `failed++`, ultimately `process.exit(1)` (`scripts/structural-invariants.mjs:49-53,59`). The SPEC requires the exit-2 path stay unchanged and the new rule's violation surface via the exit-1 path.
- Observability: no `.cycle/log.jsonl` structured events here — the checker communicates purely via stdout `ok` lines, stderr `FAIL` lines, and process exit code. Match this; do not add event emission.
- Idempotency / retry-safety: not applicable to this build-time checker — it is a pure stateless read-and-count over files; no locks, dedup keys, or persistence are involved.

### Dependencies & Integration Points
- `node:fs/promises` `readFile`, `node:path` `join` — `scripts/structural-invariants.mjs:9-10`
- Wired into the test pipeline: `posttest:coverage` runs `node scripts/structural-invariants.mjs` after the coverage gate; `check:invariants` runs it standalone — `package.json:28,30`
- The new rule reads `src/cli.ts` at `process.cwd()` (repo root when run via `npm run check:invariants`; temp dir when run via the test harness) — `scripts/structural-invariants.mjs:43`
- `src/cli.ts` imports the helper: `import { recordTerminalFailure, type HaltContext } from "./engine/halt-accounting.ts";` — `src/cli.ts:28`
- `src/engine/halt-accounting.ts` owns the `HaltContext` type and the helper; depends on `FastFailState` from `./iteration-guard.ts` — `src/engine/halt-accounting.ts:1`

### Test Infrastructure
- Test framework: Node built-in runner (`node:test`) with `node:assert` (`strict`) — `tests/scripts/structural-invariants.test.ts:1-2`. Run via `npm test` (auto-builds first).
- Test conventions: spawn the checker subprocess against a temp `cwd`; assert on `result.status`, `result.stderr` (`assert.ok(...includes(...))`, `assert.match(..., /regex/)`), and empty stderr for clean runs — `tests/scripts/structural-invariants.test.ts:27-32,44-45`.
- Mocking approach: no mocking; real `spawnSync` + real temp filesystem. Note from CLAUDE.md test conventions: `node:fs/promises` cannot be stubbed via `mock.method`; this suite avoids that entirely by using real filesystem manipulation.
- `scripts/**` floor: `scripts/sync-defaults.mjs` (90%) is the only `scripts/` per-file floor named in CLAUDE.md; `scripts/structural-invariants.mjs` has no explicit per-file floor listed, but `scripts/**` is no longer excluded from `test:coverage`, and global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) apply.
- Current coverage of the change area: the checker's pass branch, fail branch, exit-2 branch, and the loop are exercised by the three existing tests (`tests/scripts/structural-invariants.test.ts:22-55`).
- Failure-path test coverage: yes — the violation test asserts exit 1 with file/reason/expected/got substrings (`tests/scripts/structural-invariants.test.ts:22-36`); the clean test asserts exit 0 + empty stderr (`38-49`); the regression-pin test asserts the live repo root exits 0 with empty stderr (`51-55`). The SPEC requires mirroring all three shapes for the new `src/cli.ts` rule.

## Code References
- `scripts/structural-invariants.mjs:12-37` — `INVARIANTS` table; append the new `src/cli.ts` entry here
- `scripts/structural-invariants.mjs:40-57` — count-and-compare loop; emits `ok`/`FAIL` lines, no change required
- `scripts/structural-invariants.mjs:50-52` — stderr `FAIL` line format the violation test asserts against
- `src/cli.ts:439-447` — resume block; the single sanctioned inlined `consecutiveFailures += 1` (line 440) + `failedCycles.push(tail.cycleId)` (line 441)
- `src/cli.ts:531-536`, `584-589`, `604-609` — three delegating `recordTerminalFailure` call sites using assignment, not `+=`/`.push`
- `src/engine/halt-accounting.ts:35-36` — functional non-mutating form (`prev.consecutiveFailures + 1`, `[...prev.failedCycles, opts.cycleId]`) that the regex must not match (and does not, since the rule targets `src/cli.ts` only)
- `tests/scripts/structural-invariants.test.ts:11-20` — `setup` helper (writes `src/cli.ts` as `"// stub"`); must be extended to hold controllable `src/cli.ts` content
- `tests/scripts/structural-invariants.test.ts:51-55` — real-repo regression-pin test that must continue to pass
- `tests/fixtures/structural-invariants/triage-violation.ts`, `triage-clean.ts` — fixture-file precedent if new fixtures are added
- `package.json:28,30` — `posttest:coverage` and `check:invariants` wiring

## Open Questions
- Whether the new rule should use a single regex matching the paired sequence (e.g. an anchor on `consecutiveFailures \+= 1`) or two separate `INVARIANTS` entries (one for `consecutiveFailures += 1`, one for `failedCycles.push`). SPEC describes "the `consecutiveFailures += 1` increment that is paired with a `failedCycles.push(...)` mutation"; the planner must choose the concrete pattern and confirm it yields exactly the expected count against the live `src/cli.ts` (currently a single occurrence each at lines 440–441).
- Whether to extend the existing `setup(cwd, content)` helper (which currently writes a single `content` to `src/engine/triage.ts` and a `"// stub"` `src/cli.ts`) or add a parallel helper that parameterizes `src/cli.ts` content without disturbing the existing triage-rule tests — SPEC permits either.
- Whether to express the new test fixtures as inline strings or as new files under `tests/fixtures/structural-invariants/` (e.g. `cli-violation.ts` / `cli-clean.ts`), consistent with the existing fixture convention.
