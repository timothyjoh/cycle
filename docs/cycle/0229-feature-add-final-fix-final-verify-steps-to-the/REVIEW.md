# Review: Cycle 0229

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX triggers: missing test coverage for `final_fix.md` guardrails; `final_fix.md` content deviates from the `build.md`/`fix.md` File Artifact Mode pattern required by SPEC.

## Code Quality Review

### Summary
Engine changes are minimal, correct, and additive. The two constant additions (`RESET_ELIGIBLE_STEPS`, `ARTIFACT_STEPS`), the YAML insertions, and the prompt creation all follow established patterns exactly. No existing guard logic was modified. Test coverage for engine behavior is strong.

### Findings
1. **SPEC compliance — `final_fix.md` File Artifact Mode section**: SPEC requires `final_fix.md` to include "the FILE ARTIFACT MODE directive (matching the header pattern in `build.md`/`fix.md`)". Both `build.md:70` and `fix.md:49` contain `**You are writing a file, not responding in a conversation.**` as the opening sentence of their `## File Artifact Mode` sections. `final_fix.md` opens that section directly with "Do not include any of the following in your output:" — the sentence is absent. — `src/defaults/prompts/final_fix.md:32`
2. **Correct — `final_fix` does not trigger `step.name === "fix"` guards**: The empty-diff guard (`run-cycle.ts:369`) and MUST-FIX task count guard (`run-cycle.ts:358`) are both keyed on the literal string `"fix"`. `final_fix` bypasses both. — `src/engine/run-cycle.ts:358–380`
3. **Correct — `accumulateTouchedFiles` wired via set membership**: Adding `"final_fix"` to `RESET_ELIGIBLE_STEPS` covers both the pre-step snapshot capture at `run-cycle.ts:312` and the post-step accumulation at `run-cycle.ts:390`. No separate code path needed. — `src/engine/run-cycle.ts:27,312,390`
4. **Correct — `final_verify` is fatal**: Neither `final_fix` nor `final_verify` appears in the non-fatal continuation list at `run-cycle.ts:406–413`, so both steps halt the cycle on failure as required by SPEC.
5. **Correct — sync-defaults propagation**: All four modified/created files (`workflows.yml`, `final_fix.md`, `build.md`, `fix.md`) are byte-identical between `src/defaults/` and `.cycle/` (verified by `diff` during review).

### Spec Compliance Checklist
- [x] `feature` workflow contains `reflection → final_fix → final_verify → documentation` with correct agent, prompt, command, and `skip_unless` fields.
- [x] With no `FINAL_FIXES.md`, `final_fix` emits `step.end {status:"skipped", reason:"skip_unless_artifact_missing"}` and `final_verify` still executes.
- [x] With `FINAL_FIXES.md` present, `final_fix` runs and `touched.json` is updated with its git delta.
- [x] `final_verify` step name is the literal string `"final_verify"` in YAML and log events — distinct from `verify` on resume.
- [x] `final_fix` does not trigger the `step.name === "fix"` empty-diff or MUST-FIX guards.
- [ ] `src/defaults/prompts/final_fix.md` matches "the header pattern in `build.md`/`fix.md`" — **missing "You are writing a file" sentence**.
- [x] `build.md` and `fix.md` in both `src/defaults/prompts/` and `.cycle/prompts/` contain the soft self-check line.
- [x] `src/defaults/workflows.yml` and `.cycle/workflows.yml` are byte-identical after `npm run sync-defaults`.
- [ ] Tests cover: skip path, run path, footprint append, resume dedup — **covered in `run-cycle.final-fix.test.ts`, but FAM guardrail tests for `final_fix.md` are absent from `file-artifact-mode-guardrail.test.ts`**.
- [x] `npm test` passes; coverage gates hold.
- [x] All existing tests still pass; no compiler warnings.

## Adversarial Test Review

### Summary
Engine behavior tests are strong — each of the four required scenarios is exercised with appropriate assertions and correct use of cardinality-pinned filter checks. Test isolation is correct (all use `mkdtemp` + `rm` cleanup). The significant gap is in the defaults test layer: `final_fix.md` has zero coverage in `file-artifact-mode-guardrail.test.ts`.

### Findings
1. **Missing guardrail tests for `final_fix.md`**: `tests/defaults/file-artifact-mode-guardrail.test.ts` pins FAM-phrase presence and dogfood byte-identity for `build.md`, `research.md`, `fix.md`, and `documentation.md` (5 tests × 4 prompts = 20 tests). `final_fix.md` is now in `ARTIFACT_STEPS` and was added to the dogfood sync target, but no tests pin its directive presence or byte-identity. Without these, future `fix` passes can silently remove the FILE ARTIFACT MODE directive or let the dogfood copy drift. — `tests/defaults/file-artifact-mode-guardrail.test.ts` (no `final_fix` references)
2. **Correct — skip path asserts exact cardinality**: Test 1 uses `filter(...).length === 1` (not `find`) for `step.end {step:"final_fix", status:"skipped"}` and `step.start {step:"final_verify"}` — matches the cardinality-pinning convention from CLAUDE.md. — `tests/engine/run-cycle.final-fix.test.ts:91–100`
3. **Correct — run path asserts absence of skipped event**: Test 2 explicitly asserts `skipped.length === 0` for `final_fix` when `FINAL_FIXES.md` is present — covers the negative assertion. — `tests/engine/run-cycle.final-fix.test.ts:154–155`
4. **Correct — footprint test excludes pre-existing dirty file**: Test 3 dirties `src/existing.ts` before the step and asserts it is absent from `touched.json` after — correctly validates the pre-snapshot exclusion behavior. — `tests/engine/run-cycle.final-fix.test.ts:169,205`
5. **Correct — resume dedup is a pure log-parse test**: Test 4 constructs synthetic JSONL and passes it directly to `parseLogTail` — no `runCycle` call, no subprocess overhead, fast and deterministic. — `tests/engine/run-cycle.final-fix.test.ts:215–233`
6. **Minor — Test 2 does not verify `touched.json` state**: The run-path test confirms `final_fix` starts and ends `ok`, but does not assert on `touched.json` contents when `final_fix` makes no file changes. Not a bug (Test 3 covers the footprint path), but the run-path test gives no signal on whether `accumulateTouchedFiles` was invoked. Acceptable given Test 3's coverage.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.65% / 92.76% / 93.28%
- `src/engine/run-cycle.ts`: 100.00% / 96.20% / 100.00% (floor: 90%)
- Regressions vs base (per-file): none
- New code without tests: none (engine constant additions covered by new tests; prompt files are data, not code)
- Specific scenarios missing tests: `final_fix.md` FAM directive presence and dogfood byte-identity (should be in `tests/defaults/file-artifact-mode-guardrail.test.ts`)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Step sequence: `… reflection → final_fix (skip_unless: FINAL_FIXES.md) → final_verify (bash) → documentation` | `docs/ENGINE.md:86` | `src/defaults/workflows.yml:25–30` | OK |
| "Both steps are fatal on failure" | `docs/ENGINE.md:86` | `src/engine/run-cycle.ts:405–415` (neither step in non-fatal list) | OK |
| "`final_fix` is always skipped while `FINAL_FIXES.md` is absent" | `docs/ENGINE.md:86` | `src/defaults/workflows.yml:28` (`skip_unless: FINAL_FIXES.md`) + `src/engine/run-cycle.ts:263–281` | OK |
| "`final_verify` runs regardless" | `docs/ENGINE.md:86` | `src/defaults/workflows.yml:29` (no `skip_unless` on `final_verify`) | OK |
| "`final_fix` is included in `RESET_ELIGIBLE_STEPS` (alongside `build` and `fix`)" | `docs/ENGINE.md:120` | `src/engine/run-cycle.ts:27` | OK |
| "its git delta is appended to `touched.json` after the step completes, using the same `accumulateTouchedFiles` path" | `docs/ENGINE.md:120` | `src/engine/run-cycle.ts:390–393` | OK |
| "Accumulation: union across all `build`/`fix`/`final_fix` steps within a cycle" | `docs/ENGINE.md:118` | `src/engine/run-cycle.ts:27,390` | OK |
| "`ARTIFACT_STEPS` (a `Set` of the eight artifact step names: `spec`, `plan`, `build`, `fix`, `final_fix`, `research`, `review`, `documentation`)" | `docs/ENGINE.md:164` | `src/engine/run-cycle.ts:35` (8-member set) | OK |
