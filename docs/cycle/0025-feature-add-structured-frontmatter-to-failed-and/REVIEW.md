```markdown
# Review: Cycle 0025

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Minimal, focused change: one-line addition to the existing `mutateFrontmatter` patch in `cli.ts:terminalDrain`, plus extended E2E coverage. Resolves the SPEC's "in queue.ts" wording correctly by keeping the stamp at the actual file-move site in `cli.ts` and documenting the location in `CLAUDE.md`. No new exports, no signature churn, no migration logic. SPEC scope respected exactly.

### Findings
1. **Spec wording vs implementation site**: SPEC says "Plumb the active `cycle_id` into the terminal-failure path of `src/engine/queue.ts`" but the stamp lives in `src/cli.ts:terminalDrain` — `src/cli.ts:137`. PLAN and BUILD both acknowledge this deviation, and `CLAUDE.md:41` was updated to note the stamp's actual location (`cli.ts:terminalDrain`). The architectural separation (queue.ts = jsonl, cli.ts = file moves) is preserved. Acceptable resolution; not a fix.
2. **Resume path coverage by construction**: Both fresh-pop (`src/cli.ts:380`) and resume (`src/cli.ts:288`) call sites go through the same `terminalDrain`, so the `last_cycle_id` stamp is applied uniformly. No call-site-specific work needed. Verified.
3. **Insertion order in serialized YAML**: `Object.entries` preserves insertion order. The patch object spreads `...fm` first, then adds `failed_at`, optionally `failed_step`, `failed_attempts`, `last_cycle_id`. Output ordering is stable and predictable — `src/cli.ts:132-138`.
4. **`mutateFrontmatter` error path inherited**: If `parseFrontmatter` or `writeFile` fails, `terminalDrain` emits `queue.drain_warning` and proceeds with rename anyway — `src/cli.ts:139-153`. `last_cycle_id` inherits this fallback behavior identically to the preexisting fields. SPEC's "preserved with current semantics" satisfied.
5. **CLAUDE.md update**: `CLAUDE.md:41` now reads `stamps failed_at/failed_step/failed_attempts/last_cycle_id ... (the last_cycle_id stamp lives in cli.ts:terminalDrain ..., not in queue.ts itself)`. Accurate and useful for future readers.
6. **RFC-001**: Already lists `last_cycle_id: "0042"` in the failed-frontmatter schema (`docs/RFC-001-issue-lifecycle.md:93`). No update needed.

### Spec Compliance Checklist
- [x] `src/engine/queue.ts` (resolved to `src/cli.ts:terminalDrain`) writes `last_cycle_id` into failed/<id>.md frontmatter on terminal failure
- [x] `cycle_id` reaches the stamp via existing parameter threading; no new globals
- [x] Frontmatter mutation uses `parseFrontmatter` / `serializeFrontmatter` via `mutateFrontmatter` helper
- [x] `last_cycle_id` value equals the `cycle_id` emitted in matching `cycle.start` (asserted via cross-reference in test, not hard-coded)
- [x] Coverage meets baseline (≥ 95 line, ≥ 75 branch, ≥ 90 function)
- [x] On terminal failure, `failed/<id>.md` contains all four fields
- [x] On `propagateBlocked` with a 2+ hop chain, `blocked_by` lists only immediate predecessor
- [x] Existing fields preserved with current semantics
- [x] `npm test` passes (287/287, 0 fail)
- [x] `npm run typecheck` passes clean
- [x] `CLAUDE.md` updated; RFC-001 already contained the field; README correctly skipped

## Adversarial Test Review

### Summary
Strong. Both new assertions hit real filesystem state via the binary, not stubs. The `last_cycle_id` value is cross-referenced against the `cycle.start` event id rather than hard-coded, so the test survives any future change to `allocateCycleId` first-allocation behavior. Two minor regex tightness nits, none load-bearing.

### Findings
1. **Mock abuse**: None. Tests bootstrap a real git repo, real `.cycle/` tree, real `verify.sh`, spawn the real `dist/cycle.js` binary, and read real files from the temp fixture — `tests/cli/halt.test.ts:237`, `tests/cli/halt.test.ts:278`.
2. **Happy + sad paths**: Sad path is the whole subject (cycle fails, propagation fires). Both new tests cover the failure branch end-to-end.
3. **Boundary conditions**: Loose anchors on two assertions — `assert.match(failedBody, /^failed_step: verify/m)` would also match `failed_step: verify_extended`, and `/^failed_attempts: 1/m` would match `failed_attempts: 11` or `failed_attempts: 123`. Both fixtures are deterministic (`step: verify`, `max_cycle_attempts: 1`) so this can't actually false-positive in this test, but tightening to `/^failed_step: verify$/m` and `/^failed_attempts: 1$/m` would be free and consistent with the strict `^last_cycle_id: "..."$` assertion next to it — `tests/cli/halt.test.ts:266-268`. Cosmetic, not a fix.
4. **Integration gaps**: None — the 3-node chain test is exactly the end-to-end gate the SPEC asked for, complementing the existing engine-level `tests/engine/blocked.test.ts:111` (transitive) and `:135` (diamond) cases.
5. **Assertion quality**: The `last_cycle_id` assertion is anchored on both sides (`^last_cycle_id: "${cycleId}"$` with `m`) and cross-references the actual event, which is the strongest form available short of full snapshot. Strong.
6. **Missing test cases**: SPEC mentions diamond / fan-out as a possibility ("`A ← {B, C}`"). Plan chose the chain form (`A ← B ← C`) which exercises 2 hops; the diamond form is already covered at the engine layer (`tests/engine/blocked.test.ts:135`). No CLI-level diamond regression, but the SPEC's "or" disjunction made this an explicit choice — not a gap.
7. **Test independence**: Each test uses its own `mkdtemp` root and cleans up in `finally`. No shared mutable state.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 97.14 / 90.64 / 96.21
- Regressions vs base (per-file): none — every file matches or exceeds the master baseline
- New code without tests: none — `src/cli.ts:137` is exercised by both `halt.test.ts:237` (propagateBlocked) and `halt.test.ts:278` (3-node chain)
- Specific scenarios missing tests: none load-bearing. Possible future polish: CLI-level diamond fan-out for `blocked_by`, but engine-layer coverage already exists and SPEC accepted chain-or-diamond as alternatives.
```

End: PASS verdict. No MUST-FIX.md written. Two cosmetic regex-anchor nits noted but below fix bar.
