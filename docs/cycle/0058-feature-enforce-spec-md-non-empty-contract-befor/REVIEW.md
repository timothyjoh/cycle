Now REVIEW.md to stdout for engine capture:

```markdown
# Review: Cycle 0058

## Overall Verdict
NEEDS-FIX — one minor test-coverage gap on the post-sanitization measurement contract. See MUST-FIX.md. The implementation itself is correct, lean, and matches SPEC + PLAN exactly; the gap is a regression-prevention pin, not a defect.

## Code Quality Review

### Summary
Six-line guard inserted at the existing artifact-write seam in `src/engine/run-cycle.ts` — minimal surface, no new control flow, no new event keys, no schema changes. The single named module constant (`SPEC_MIN_BYTES = 200`) and the pure exported `formatSpecGuardError(path, bytes, threshold)` helper match SPEC §Requirements and PLAN Tasks 1 + 3 verbatim. Failure routes through the existing `cycle.end status:"failed" failing_step:"spec"` branch; reflection / documentation non-fatal short-circuits are correctly bypassed for `step.name === "spec"`.

### Findings
1. **Implementation matches plan exactly**: `sanitized` is computed once and reused for both the `writeFile` and the `Buffer.byteLength` measurement — `src/engine/run-cycle.ts:153-162`. Strict `<` boundary, `r.exitCode || 1` fallback, in-place field mutation (not `let` rebind), all per plan.
2. **No magic numbers at call site**: the literal `200` appears only in the `SPEC_MIN_BYTES` declaration at `src/engine/run-cycle.ts:25`. The guard and the formatter both reference the constant.
3. **Failure path is structurally clean**: the enclosing `if (r.status === "ok" && step.name)` at line 152 means the guard only fires after a successful agent run, so `r.exitCode || 1 === 1` always — no risk of clobbering a legitimate non-zero exit code. PLAN Risk Assessment §5 flagged this and the code respects it.
4. **`r.stderr` is written but never emitted**: the engine's `step.end` event does not carry stderr (SPEC §Requirements explicitly forbids new payload keys), so the guard's error string is observable only via the `formatSpecGuardError` unit test, not via runtime log inspection. This is the chosen tradeoff in PLAN Task 2's "truly final resolution" — single source of truth for the error string lives in the exported helper. Acceptable.
5. **CLAUDE.md bullet placed correctly**: `CLAUDE.md:77` (immediately after the `Artifact sanitization` bullet, per SPEC §Documentation Updates). Bullet describes constant location, what is measured, failure path, strict-`<` boundary, branch / `no_branch` parity, and the bash-seam gap.
6. **No `src/defaults/prompts/spec.md` edit (Task 5 skipped)**: BUILD.md justification — engine guard is load-bearing regardless and `sync-defaults` divergence risk isn't worth an optional polish line. Defensible.

### Spec Compliance Checklist
- [x] Guard runs unconditionally for `step.name === "spec"`, branch or `no_branch` — covered by parameterized `for (const noBranch of [false, true])` loop in `tests/engine/run-cycle.spec-guard.test.ts:68`.
- [x] Single named module constant — `src/engine/run-cycle.ts:25`.
- [x] Failure path reuses existing `r.status === "failed"` branch — `src/engine/run-cycle.ts:170`. No parallel exit path introduced.
- [x] `step.end` carries `status:"failed"` + non-zero `exit_code` (1) — asserted via log regex at `tests/engine/run-cycle.spec-guard.test.ts:86-87`.
- [x] Falls through to `cycle.end status:"failed" failing_step:"spec"` (NOT to reflection/documentation non-fatal branches) — guard fires before `reflection` ingest at line 165 and the `step.name === "reflection"` and `=== "documentation"` short-circuits at lines 171-178 are correctly bypassed.
- [x] Strict `<` boundary — at-threshold test (exactly 200 bytes) passes.
- [x] Greppable, stable error string format — pinned by `formatSpecGuardError` unit test at `tests/engine/run-cycle.spec-guard.test.ts:170-175`.
- [x] CLAUDE.md updated; README.md untouched — matches SPEC §Documentation Updates.
- [x] `npm run typecheck` clean.
- [x] `npm test` 389/389 passing.
- [x] `npm run test:coverage` aggregates: line 99.07% / branch 92.93% / function 96.36% — all above baselines (≥ 95 / 75 / 90). `src/engine/run-cycle.ts` itself: 100% line / 95.83% branch / 100% func. Per-file gate `src/engine/triage.ts` 99.72% ≥ 95% untouched.
- [ ] Byte count is measured on the **post-sanitization** payload — implementation is correct (`Buffer.byteLength(sanitized, "utf8")` at line 157, not `r.stdout`) but **not exercised by the regression suite**. All current tests feed plain-text payloads where sanitization is a near-no-op, so a regression that swapped `sanitized` for `r.stdout` at line 157 would not be caught. SPEC §Requirements calls this scenario out explicitly. → MUST-FIX Task 1.

## Adversarial Test Review

### Summary
Strong. Eight tests across two workflow shapes (branch, no_branch) × three byte-payload scenarios (empty, under-threshold, at-threshold), plus two direct unit tests for the formatter + constant. Real `runCycle`, real `git init` tempdirs, real fake-binary PATH override — zero mocks, matching the prevailing pattern in `tests/engine/run-cycle.*.test.ts`. Each scenario uses `mkdtemp` + `finally` cleanup. Assertions are specific (exact log regex, exact byte counts, exact file content), not weak truthy checks.

### Findings
1. **Test isolation and hygiene**: every scenario allocates a fresh tempdir pair (`root`, `bin`) and cleans both in `finally` at `tests/engine/run-cycle.spec-guard.test.ts:63-66`. No shared state, no execution-order dependence.
2. **Log-walk assertions match existing precedent**: uses the same `assert.match(log, /…/)` pattern as `tests/engine/run-cycle.test.ts:126-179`. Regex anchors on `cycle_id`, `step`, `status`, `failing_step` — specific enough to catch regressions, loose enough to survive cycle-id rotation.
3. **At-threshold construction is brittle to sanitizer trailing-newline behavior**: the test at `tests/engine/run-cycle.spec-guard.test.ts:135-167` constructs a 200-byte payload as "199 x's + sanitizer appends '\n'". If `sanitizeArtifactStdout`'s `s === "" ? "" : s + "\n"` behavior at `src/engine/sanitize-artifact.ts:17` ever changes (e.g. preserve-existing-newline-or-add semantics), the at-threshold test silently shifts to 199 bytes and starts failing the guard. Acceptable for now since both surfaces are in this repo, but a comment pinning the dependency would future-proof it. Not a fix-block.
4. **Mass `echo FAKED` → `yes FAKED | head -50` swap in `tests/engine/run-cycle.test.ts`**: 21 call sites updated to clear the 200-byte floor. Verified no other test in `tests/engine/` asserts artifact content equals `FAKED\n` literally (only `branch.test.ts:174,178` writes `SPEC.md` directly and asserts against `"kept"` — unaffected). PLAN Risk §1 anticipated this and the swap matches the planned mitigation.
5. **Sanitization-induced failure not directly tested**: as noted in the Spec Compliance checklist above — see MUST-FIX Task 1 for the recommended regression. This is the only adversarial gap I'd block on.
6. **Resume-during-spec is not tested**: a workflow that resumes mid-spec would re-run `spec` from scratch (restart policy only applies to `build`/`fix`). The guard would re-fire on resume identically. SPEC doesn't require resume coverage for `spec`, so this is not a defect — flagging it only as a future-work observation.
7. **Bash-step spec bypass is not tested**: documented as a future-work boundary in CLAUDE.md and PLAN Risk §4; current default workflows have no bash `spec` step. Out of scope for this cycle.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 99.07% / 92.93% / 96.36% (aggregate, all files)
- `src/engine/run-cycle.ts` per-file: 100% line / 95.83% branch / 100% function
- `src/engine/triage.ts` per-file gate: 99.72% line ≥ 95% (untouched)
- Regressions vs base (per-file): none
- New code without tests: `formatSpecGuardError` + `SPEC_MIN_BYTES` covered by direct unit tests; the guard branch at `src/engine/run-cycle.ts:156-163` is covered by the 6 parameterized integration tests
- Specific scenarios missing tests: **raw stdout >= SPEC_MIN_BYTES but post-sanitization payload < SPEC_MIN_BYTES** — see MUST-FIX Task 1. (This is the only gap that materially affects regression-prevention; everything else SPEC requires is exercised.)
```

REVIEW above (stdout-captured to `docs/cycle/0058-.../REVIEW.md`). One MUST-FIX written to disk — minor sanitization-measurement contract pin, ~25-line test addition.
