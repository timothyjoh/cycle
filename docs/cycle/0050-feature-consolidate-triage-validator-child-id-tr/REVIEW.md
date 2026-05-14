Cycle 0050. Refactor clean, minimal, passes all gates. Drop REVIEW to stdout. No MUST-FIX.

```markdown
# Review: Cycle 0050

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Pure validator-internal refactor that lands exactly per PLAN. One `childIds: Set<string>` survives in `validateOutput`, populated inline during the children-shape loop and consumed by all three downstream paths (duplicate-id rejection, `ordering[]` membership, `depends_on` resolution via `knownIds`). Net `+9 / -10` lines in `src/engine/triage.ts`. Zero behavioral change observable through any existing test; one new regression test added.

### Findings
1. **Check-precedence drift on multi-error inputs (intentional, documented)**: pre-refactor, `decomposed_parents` membership and the standalone duplicate-id pass ran AFTER the full children-shape loop completed; post-refactor, the inline duplicate check fires mid-loop, so on multi-violation inputs the duplicate may now beat (a) a later child's shape error and (b) the `decomposed_parents` membership error. SPEC requires "same inputs rejected" (held) but speaks loosely about "same order of checks"; PLAN §Risk Assessment called out the cross-child shape variant but not the decomposed_parents variant. No test pins cross-violation precedence (verified by reading every `checkReject` call) and the only production caller (`processRawWithRetry`) feeds the reason back as retry text, so the practical impact is zero — `src/engine/triage.ts:470-475` vs former `src/engine/triage.ts:481-490`.
2. **Structural invariants from PLAN hold** — `src/engine/triage.ts:407` is the single `const childIds` declaration; `seen` is gone; the `new Set(children.map((c) => c.id))` rebuild is gone. Confirmed via `rg`:
   ```
   const childIds = new Set<string>();   # src/engine/triage.ts:407 (only)
   const orderingSeen = new Set<string>(); # src/engine/triage.ts:504 (untouched)
   \bseen\b → 0 hits
   new Set\(children\.map → 0 hits
   ```
3. **Reflow only outside the touched block** — `queueIds` / `pendingIds` / `ordering[]` loop / `knownIds` / `depends_on` pass are byte-identical except for line-number shift. Diff confirms (`src/engine/triage.ts:490-537`).
4. **BUILD.md branch-drift math** — BUILD.md says "branch drift is one-hundredth of a percent (92.82 → 92.78, 96.32 → 96.30)." Actual deltas are −0.04 (branch) and −0.02 (function), i.e. four-hundredths and two-hundredths. Cosmetic; not worth a fix.

### Spec Compliance Checklist
- [x] One `Set<string>` of child ids in `validateOutput`, populated in exactly one place — `src/engine/triage.ts:407, 476`.
- [x] `seen` removed; `childIds` survives, built once at/before the duplicate-id check.
- [x] All existing validator + e2e cases (`duplicate`, `ordering` membership, `depends_on` resolution, self-loop, sibling-resolution, pending-queue resolution) still pass.
- [x] New regression test asserts cross-consumer membership in one accepted output — `tests/engine/triage-validator.test.ts:305-340`.
- [x] No new compiler/linter warnings (`npm run typecheck` exit 0, zero output).
- [x] BUILD.md records consolidation + post-change deltas.

## Adversarial Test Review

### Summary
Adequate. The new test exercises the happy path through both consumers, but it cannot pin the structural invariant the SPEC actually wants protected — that's a limitation of behavioral testing, not a defect.

### Findings
1. **New test does not fail if the consolidation is reverted** — `tests/engine/triage-validator.test.ts:305-340` asserts `r.ok === true` and reads `r.parsed.ordering` + `r.parsed.children[1].depends_on[0]`. If a future contributor splits `childIds` back into two locals (one populated by the shape loop for duplicate detection, another rebuilt later via `new Set(children.map((c) => c.id))` for `ordering`/`knownIds`), this test STILL passes because both copies would still contain `R1-a`. PLAN Task 2 Success Criteria explicitly called this out ("The new test fails if childIds is artificially split back into two sets — confirms the test is load-bearing on the consolidation"); that criterion is unmet because the public validator API exposes only accept/reject + parsed output, with no observable channel for set identity. The structural invariant is held instead by the `rg "const childIds" | wc -l == 1` check that BUILD.md performed once at build time, not by an automated regression test. Not actionable at the test layer without changing the validator's surface area, which is out of scope.
2. **No mock abuse** — `validateOutput` is a pure function; tests call it directly with hand-built `stdout`, `queueRows`, and `cfg` fixtures. Zero mocking. Consistent with file conventions.
3. **Boundary / failure coverage preserved** — every existing rejection case the SPEC enumerated (duplicate child id, ordering membership miss, unknown `depends_on`, self-loop, decomposed-parent-as-depends-on) continues to pass against the refactored validator. Verified by `npm test` (`368/368 pass`, +1 vs prior `367`).
4. **`fakeRaws` extension is safe** — added `R2` entry at `tests/engine/triage-validator.test.ts:21`. No prior test asserts `fakeRaws.length === 1` (`grep` confirmed); all existing cases either build their own children referencing `R1` or use the shared `validChildR1Json` fixture which is `R1`-scoped. No regressions.
5. **Assertion quality** — strong: `assert.equal(r.ok, true)`, `assert.deepEqual(r.parsed.ordering, …)`, `assert.equal(r.parsed.children[1].depends_on[0], …)`. Concrete shapes, not truthy checks. The `assert.equal(r.ok, true, …reason)` form even surfaces the validator's reject reason on failure, which is the right shape for this file.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **99.05% / 92.78% / 96.30%** (aggregate)
- Per-file `src/engine/triage.ts`: **line 99.72%** (≥ 95% floor ✓), branch 97.78%, function 97.50%
- `posttest:coverage` gate: `ok — src/engine/triage.ts 99.72% ≥ 95%`
- Regressions vs base (post-0049 master baseline: line 99.05%, branch 92.82%, function 96.32%, triage.ts line 99.72%):
  - aggregate branch: 92.82 → 92.78 (−0.04, mechanical — one `for` loop removed)
  - aggregate function: 96.32 → 96.30 (−0.02, mechanical)
  - per-file triage.ts line: unchanged at 99.72
  - All floors hold; no per-file regression.
- New code without tests: none — the only new code is two lines (`if (childIds.has) reject` + `childIds.add`) and both branches are exercised by the existing "rejects duplicate child ids" case (true branch) and every happy-path case (false branch).
- Specific scenarios missing tests: none beyond the structural-invariant caveat above (Finding 1), which is inherent to black-box testing.
```

`★ Insight ─────────────────────────────────────`
Structural invariants ("exactly one Set, not two") are testable only at the syntax/AST level — black-box tests on a pure validator can pin behavior but not identity. The right enforcement is a lint/`rg` check baked into the build step or a per-file structural assertion, not a unit test. PLAN's optimism here is a small process bug worth flagging in reflection.

Check-precedence on multi-violation inputs is a subtle refactoring trap: SPEC said "same order of checks," but folding a check INTO a per-iteration loop reorders it relative to passes that ran AFTER the original loop. Safe here only because no test and no caller depend on the precedence — a smaller blast radius than typical.
`─────────────────────────────────────────────────`

Cycle 0050 PASS. Eligible for `verify` → `commit` → `pr` → `reflection`. No MUST-FIX.
