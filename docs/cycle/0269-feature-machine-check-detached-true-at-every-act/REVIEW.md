All gates verified green. Writing the review.

# Review: Cycle 0269

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, well-scoped structural-invariants addition that machine-checks the `detached: true` process-group-leader contract at every `exec-*.ts` spawn site, mirroring the existing cycle-0267 active-child-registration predicate exactly. No runtime behavior changes; all three current spawn sites already comply. Implementation matches PLAN.md to the letter.

### Findings
1. **Correctness**: `validateDetachedSpawn` is a pure `(text, file)` predicate with three explicit branch returns and no throw path — `scripts/structural-invariants.mjs:134`. Vacuous no-`spawn(` pass, `spawn(`-with-`detached` pass, and a named `{ ok: false, message }` failure naming the file + remediation.
2. **Anchoring**: reuses the existing `\bspawn\s*\(` anchor (`SPAWN_CALL`) so `spawnSync(` does not trip the probe — `scripts/structural-invariants.mjs:36`; the new `DETACHED_TRUE = /detached\s*:\s*true/` is file-level, correctly handling `exec-spawn.ts`'s `detached: true` living in the shared `base` options object rather than on the `spawn(` line.
3. **Registration parity**: the per-lane `.map` registers the identical 8-lane list as the active-child entry directly above it — `scripts/structural-invariants.mjs:337`. Verified the list matches the actual `src/engine/exec-*.ts` fileset (8 lanes; `exec-types.ts` correctly excluded as a non-lane).
4. **Fail-safe**: never fail-open — the predicate surfaces a named failure to the dispatch loop (`console.error` + exit 1); a defensive throw is contained as a `FAIL` by the unchanged dispatch `try/catch`. No swallowed errors, no silent-pass paths.
5. **Scope discipline**: `walkthrough.ts` correctly excluded (not an `exec-*.ts` lane; already compliant) per resolved open question 1 — matches SPEC Out-of-Scope.

### Spec Compliance Checklist
- [x] New exported predicate returns `{ ok: false }` for `spawn(` without `detached: true`, `{ ok: true }` for `spawn(`+`detached: true` and for no-`spawn(` — `scripts/structural-invariants.mjs:134`
- [x] Registered as one `INVARIANTS` entry per existing `exec-*.ts` lane (same list as `validateActiveChildRegistration`) — `scripts/structural-invariants.mjs:337`
- [x] `npm run check:invariants` exits 0; 8 new `detached-spawn` lines present (`exec-spawn`/`exec-bash` → `spawn( with detached: true`; 6 agent lanes → `no spawn( — vacuous`)
- [x] Predicate never throws on malformed lane text; vacuous pass on no-`spawn(`
- [x] Co-located JSDoc `@param`/`@returns` matches implementation; `npm run typecheck` clean
- [x] CLI behavior (exit 0/1/2, stdout/stderr format) unchanged except the new check's lines
- [x] CLAUDE.md structural-invariants paragraph + adding-an-agent note (c) updated; `AGENTS.md` absent — correctly no-op'd
- [x] `## Acceptance Criteria` section present in SPEC.md with testable bullets
- [x] PLAN.md `## SPEC Acceptance Traceability` section present; every AC bullet re-quoted verbatim and paired with a covering task

## Adversarial Test Review

### Summary
Strong. Tests drive the real exported predicate in-process (anti-mock), exercise every branch plus the `spawnSync(` substring trap and whitespace tolerance, and include both a dispatch-level fail (synthetic temp lane) and a dispatch-level pass against the real `exec-spawn.ts` (proving file-level detection finds `detached: true` in the `base` object). The `setup` helper's synthetic spawn stubs were correctly updated to carry `detached: true` so the subprocess-driven clean-tree tests still pass against the new invariant.

### Findings
1. **Assertion quality**: specific — failure-path test asserts `res.ok === false`, `message` includes both the file name (`src/engine/exec-x.ts`) and `detached: true`, and `assert.doesNotThrow` — `tests/scripts/structural-invariants.test.ts:346`.
2. **Failure coverage present**: dispatch-level fail asserts return `1` and a `FAIL`/`detached: true` line via `captureConsoleError()` — `tests/scripts/structural-invariants.test.ts:372`; not happy-path-only.
3. **Substring trap + whitespace**: explicit cases for `spawnSync(`-only (vacuous) and `spawn ( … detached : true` whitespace tolerance — `tests/scripts/structural-invariants.test.ts:360`/`:366`.
4. **Integration / regression**: the existing full-suite `runInvariants(INVARIANTS, repoRoot)` exit-0 pin exercises all 8 new entries against the real tree; the real-`exec-spawn.ts` dispatch pass confirms end-to-end detection.
5. **Test independence**: each case uses isolated `mkdtemp` roots with `rm` cleanup in `finally`; no shared mutable state or order dependence.

### Test Coverage
- Command run: `npm run test:coverage` (then `npm run check:coverage`)
- Tests: **1181 / 1181 pass, 0 fail**
- Coverage gate: **exit 0** — every per-file floor met (e.g. `exec-spawn.ts` 100% ≥ 90%, `exec-bash.ts` 100% ≥ 90%, `run-cycle.ts` 100% ≥ 90%)
- Regressions vs base (per-file): none
- New code without tests: none — `structural-invariants.mjs` has no declared per-file floor; every new predicate branch (vacuous / pass / fail / `spawnSync(` trap / whitespace) is exercised
- Specific scenarios missing tests: none

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `validateDetachedSpawn` predicate registered as one relational entry per `exec-*.ts` lane | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:134`, `:337` | OK |
| fails the build if a lane that calls `spawn(` omits `detached: true` | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:135` | OK |
| `process.kill(-pid, …)` group-kill (`killActiveChildren`) | `CLAUDE.md:58` | `src/engine/active-child.ts:33` | OK |
| group-probe (`anyChildAlive`) | `CLAUDE.md:58` | `src/engine/active-child.ts:54` | OK |
| detection is file-level (`detached: true` may live in a shared options object) | `CLAUDE.md:58` | `scripts/structural-invariants.mjs:42` (`DETACHED_TRUE`), `:134` | OK |
| adding-an-agent note (c): pass `detached: true`, register per-lane detached-spawn entry | `CLAUDE.md:60` | `scripts/structural-invariants.mjs:337` | OK |
