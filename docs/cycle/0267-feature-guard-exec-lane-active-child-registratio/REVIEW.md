# Review: Cycle 0267

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, well-scoped additive change that machine-enforces the cycle-0265 orphan-reap convention via one shared relational predicate registered per exec lane. It faithfully implements all three PLAN tasks, mirrors the canonical `validateResidueArmPersist` shape, introduces no runtime behavior change, and passes the full gate (1169 tests, typecheck, invariants, coverage) cleanly.

### Findings
1. **Correctness (positive)**: `\b` anchoring is genuinely load-bearing and correct. `spawnSync(` does not satisfy `/\bspawn\s*\(/`, and `unregisterActiveChild` does not satisfy `/\bregisterActiveChild\s*\(/` (no word boundary between `un` and `register`) — both real substring traps in this codebase, each covered by a dedicated unit test — `scripts/structural-invariants.mjs:36-38`.
2. **Correctness (positive)**: The `\s*\(` requirement means the registry `import { registerActiveChild, unregisterActiveChild }` line (no trailing paren) does not falsely satisfy the probes — only call sites count, which is the intended semantic — `scripts/structural-invariants.mjs:97-110`.
3. **Fail-safe (positive)**: The genuine missing-call case *returns* `{ ok:false, message }` naming the file and each missing call rather than throwing, so the operator gets an actionable diagnostic; the unchanged `runInvariants` `try/catch` still contains any unexpected throw as a FAIL — `scripts/structural-invariants.mjs:102-110`.
4. **Idempotency (positive)**: All three regexes are non-global, so no `lastIndex` state leaks across the per-lane reuse of the shared predicate — `scripts/structural-invariants.mjs:36-38`.
5. **Minor / by-design (not a defect)**: The check is whole-file string presence, so a `spawn(` inside a comment/string would demand registration (fails *safe*) and a `registerActiveChild(` inside a comment would satisfy the probe (fails *open*). This is the SPEC-mandated "minimal and structural (string/regex presence)" approach, consistent with the existing residue predicate — acceptable, not a fix.
6. **Architecture (positive)**: Reuses `runInvariants` as-is with no new dispatch machinery; the one-file-per-entry constraint is correctly handled via a `.map` spread of per-lane entries, and the "new lane → add an entry" gap is explicitly documented in the CLAUDE.md agent-add checklist — `scripts/structural-invariants.mjs:286-293`.

### Spec Compliance Checklist
- [x] `npm run check:invariants` exits 0 against the current tree; both spawners emit `spawn( paired with register/unregister`, six agent lanes emit `no spawn( — vacuous` (verified live, EXIT=0).
- [x] User-observable-benefit test: synthetic lane with `spawn(` missing `unregisterActiveChild` → `{ ok:false }` with message naming file + call — `tests/scripts/structural-invariants.test.ts:264-272`.
- [x] Failure-path test: missing-registry lane driven through `runInvariants` → non-zero count + `FAIL` line naming the lane — `tests/scripts/structural-invariants.test.ts:296-322`.
- [x] Vacuous-pass test: no `spawn(` → `{ ok:true }` — `tests/scripts/structural-invariants.test.ts:253-257`.
- [x] All existing tests pass (1169/1169).
- [x] `npm run typecheck` clean; predicate matches the `Invariant.validate` JSDoc typedef under `// @ts-check` + `allowJs`.
- [x] SPEC `## Acceptance Criteria` present with 6 testable bullets.
- [x] PLAN `## SPEC Acceptance Traceability` present; all 6 SPEC AC bullets re-quoted verbatim and each paired with a covering task — `PLAN.md:247-256`.
- [x] CONCRETE USER BENEFIT delivered end-to-end: a maintainer dropping a registry call from a spawning lane now gets a named, build-failing `structural-invariants: FAIL <file> -- …` (demonstrated by the dispatch-integration test capturing the `FAIL` line and the `unregisterActiveChild` name).
- [x] CLAUDE.md updated (Structural-invariants policy paragraph + agent-add checklist clause (c)).
- [x] No exec-lane runtime behavior changed (diff touches only the `.mjs`, the test, and CLAUDE.md).

## Adversarial Test Review

### Summary
Strong. Seven new tests cover all three predicate branches plus both anchor traps and a dispatch-level integration with a real temp-dir fixture. Assertions are specific (status, message substrings, captured `FAIL` line, failure count), no mocking is used (real predicate + real filesystem fixtures), and every test is self-isolating via `mkdtemp` + `finally rm`.

### Findings
1. **Boundary coverage (positive)**: Both substring traps are explicitly exercised — `spawnSync(`-only → vacuous pass, and `unregisterActiveChild(`-only → fail listing `registerActiveChild` — `tests/scripts/structural-invariants.test.ts:280-294`.
2. **Assertion quality (positive)**: The fail tests assert on the exact message content (file path + specific missing call) rather than mere truthiness — `tests/scripts/structural-invariants.test.ts:267-271`.
3. **Minor (not a fix)**: The "no other invariant's result altered" SPEC clause is satisfied structurally (the integration test passes a single-entry array to `runInvariants`, so no other entry can run), and the full-table real-repo subprocess pins independently confirm the table still exits 0. The negative assertion `!res.message?.includes("unregisterActiveChild —")` at `tests/scripts/structural-invariants.test.ts:278` is slightly coupled to the message's literal `" — "` separator, but it is correct for the current format and adequately guards the anchor behavior.

### Test Coverage
- Command run: `npm run test:coverage` (then `npm test`)
- Line / branch / function: `scripts/structural-invariants.mjs` at **97.57% line** (coverage-gate `≥ 90%` floor). Raw c8 aggregate "all files" reads 46.29% line / 88.73% branch but is not the gate — per-file floors are; the gate exits 0.
- Regressions vs base (per-file): none — `npm run check:coverage` exits 0, every per-file floor met. Change is purely additive (new predicate + tests + one doc note); no runtime engine file touched.
- New code without tests: none — all three predicate branches plus both anchor guards and the dispatch path are exercised.
- Specific scenarios missing tests: none material.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "the shared `validateActiveChildRegistration` predicate is registered as one relational entry per `src/engine/exec-*.ts` lane" | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:97`, `scripts/structural-invariants.mjs:286-293` | OK |
| "fails the build if any lane that calls `spawn(` omits `registerActiveChild` or `unregisterActiveChild`" | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:98-110` | OK |
| "non-spawning lanes pass vacuously" | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:98` | OK |
| "(c) … register its **active-child-registration** invariant entry (one per `exec-*.ts` lane, sharing `validateActiveChildRegistration`) … and ensure the lane pairs `registerActiveChild`/`unregisterActiveChild` around the `spawn(`" | `CLAUDE.md:60` | `scripts/structural-invariants.mjs:286-293`, `src/engine/exec-spawn.ts:43-58`, `src/engine/exec-bash.ts:33-51` | OK |

No unbacked claims. No stale "unguarded" assertion remains for this convention.
