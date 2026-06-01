# Review: Cycle 0024

## Overall Verdict
PASS — no fixes needed

All five PLAN tasks landed as specified; `npm run test:coverage` is green (904/904 tests, all per-file floors pass, `src/engine/walkthrough.ts` at 100% ≥ 95%, `src/engine/run-cycle.ts` at 100% ≥ 90%, overall branch 87.38% ≥ 75%), `npm run typecheck` is clean, and all structural invariants pass. SPEC has a populated `## Acceptance Criteria` section; PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every AC bullet. Every in-scope documentation claim is backed by a real `file:line` reference. No swallowed errors, no fail-open defaults.

## Code Quality Review

### Summary
A clean, minimal, well-isolated implementation. All discovery/exec/collection logic is concentrated in the directly-testable `src/engine/walkthrough.ts`; `run-cycle.ts` gains only a thin name-keyed intercept that delegates and `continue`s. Subprocess discipline (array-arg `/bin/bash`, `shell:false`, curated `buildChildEnv` with `CYCLE_*` re-injection) is honored exactly. Failure handling is fail-safe throughout: absence is a defined `null` outcome, hook non-zero exit routes fatally, and the only `catch` is the named `step.walkthrough_capture_failed` degrade event.

### Findings
1. **Failure handling (no silent failure)**: The intercept's lone `catch` re-emits a `step.walkthrough_capture_failed` event carrying `cycle_id`, `step`, `artifact`, and `error.message`, then preserves `step.end { status: "ok" }` — observable degrade, never swallowed — `src/engine/run-cycle.ts:389-396`.
2. **Failure handling (fail-safe)**: `resolveWalkthroughHook` treats any `stat` error or a present-but-non-executable file as inert (`null`) rather than failing the cycle — the safe default for an optional hook — `src/engine/walkthrough.ts:25-31`.
3. **Failure handling (no swallowed exit code)**: `execWalkthroughHook` maps both the `close` non-zero exit and the `error` (spawn-level) event to a failed `StepResult` with stderr, so a missing `/bin/bash` or unreadable script can never become an unhandled rejection — `src/engine/walkthrough.ts:51-57`.
4. **Edge case (collect semantics)**: `collectWalkthroughMedia` distinguishes ENOENT (hook produced nothing ⇒ `[]`, clean) from any other readdir error (⇒ throws into the degrade surface) — explicit, not fail-open — `src/engine/walkthrough.ts:69-72`.
5. **Subprocess discipline**: `CYCLE_ARTIFACT_DIR` is re-injected through `buildChildEnv`'s `extra` alongside the spread `cycleEnv` (which carries `CYCLE_ID`/`CYCLE_TITLE`/`CYCLE_BASE`), satisfying the strip/re-inject contract — `src/engine/run-cycle.ts:367-370`.
6. **Idempotency**: Manifest path is deterministic (`<artifactDir>/walkthrough-artifacts.json`); re-writes are last-write-wins. Hook re-run safety is correctly delegated to the hook author and documented in `docs/ENGINE.md` — acceptable for an engine-orchestration-only feature.

### Spec Compliance Checklist
- [x] `walkthrough_capture` is the last step of the `feature` workflow in `src/defaults/workflows.yml:42`; `.cycle/workflows.yml:42` is byte-identical (asserted by `tests/dogfood/feature-yaml.test.ts` + `tests/defaults/feature-yaml.test.ts`).
- [x] No-hook repo reaches the step and skips clean — single `step.end{status:"skipped", reason:"walkthrough_hook_absent"}`, no `step.start`, no failure, cycle green (`run-cycle.ts:356-365`; tested).
- [x] Configured hook emitting media → files present under the artifact dir, `walkthrough_artifacts` pointer on `step.end` (`run-cycle.ts:397-404`; tested).
- [x] Write-failure degrade emits `step.walkthrough_capture_failed`, omits the pointer, leaves the cycle outcome unchanged, does not crash (`run-cycle.ts:389-396`; tested).
- [x] No-hook step never emits `step.end{status:"failed"}` and does not affect cycle outcome (tested).
- [x] All existing tests pass (`npm test` → 904/904).
- [x] `npm run typecheck` clean.
- [x] Docs updated: CLAUDE.md, README.md, docs/ENGINE.md (SPEC §Documentation Updates).
- [x] Out-of-scope respected: no built-in capture impl, step added to `feature` only, no hook configured for cycle's own repo.

## Adversarial Test Review

### Summary
Strong. Tests use real implementations exclusively — temp dirs, real `/bin/bash` scripts, `chmod`, and make-path-a-directory to force `EISDIR`/`ENOTDIR` — with zero `mock.method` on `node:fs/promises` (per the CLAUDE.md constraint). Failure paths are first-class: each named failure mode (spawn error, non-ENOENT readdir throw, manifest `EISDIR`, hook non-zero exit) has a dedicated test. Assertions are specific (exact pointer equality, exact relative media paths, exit codes, cardinality-pinned event counts).

### Findings
1. **Boundary coverage**: `collectWalkthroughMedia` is tested for the empty (missing-dir ⇒ `[]`), populated-with-nesting (sorted relative paths), and error (path-is-a-file ⇒ throws non-ENOENT) cases — `tests/engine/walkthrough.test.ts:166-206`.
2. **Cardinality pinning**: The degrade integration test uses `expectExactlyOne(events, "step.walkthrough_capture_failed")` and `filter(...).length === 1` for `step.start`/`step.end`, per the exactly-once convention — `tests/engine/run-cycle.walkthrough.test.ts:114-118, 187`.
3. **Discovery matrix**: `resolveWalkthroughHook` covers null/convention/relative/absolute/missing/non-executable/blank-whitespace-fallback — seven distinct cases — `tests/engine/walkthrough.test.ts:35-117`.
4. **Integration vs unit separation**: helpers are unit-tested directly and the full `runCycle` path is integration-tested through the temp-repo harness across all four SPEC scenarios plus an explicit-config-path case — no integration gap.
5. **Minor (non-blocking)**: The `execWalkthroughHook` "spawn error" test (`walkthrough.test.ts:151-162`) actually exercises bash-exits-non-zero-on-missing-script, not a true `child.on("error")` spawn failure; the genuine `error`-handler branch is nonetheless covered (line coverage 100%) by the bundled run. Not a defect — noted for accuracy only.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: overall 40.83% line / 87.38% branch / 46.17% function (repo-wide figure dominated by intentionally-excluded vendored `types.ts`/`utils.ts`/`worktree.ts`); per-file gate authoritative — `src/engine/walkthrough.ts` 100.00%, `src/engine/run-cycle.ts` 100.00%.
- Regressions vs base (per-file): none — all floors report `ok`.
- New code without tests: none.
- Specific scenarios missing tests: none.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `walkthrough_capture` is `feature`'s final step | `README.md:146`, `docs/ENGINE.md:119` | `src/defaults/workflows.yml:42` | OK |
| `engine.walkthrough_hook` config path (`.cycle/workflows.yml`) | `README.md:154`, `docs/ENGINE.md:205` | `src/engine/workflow.ts:54`; read at `src/engine/walkthrough.ts:20` | OK |
| `.cycle/walkthrough.sh` convention, executable file | `CLAUDE.md:80`, `docs/ENGINE.md:205` | `src/engine/walkthrough.ts:24,27` | OK |
| `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` when inert | `CLAUDE.md:80`, `docs/ENGINE.md:207` | `src/engine/run-cycle.ts:357-364` | OK |
| Spawns via `/bin/bash <abs>`, array args, `shell:false`, `buildChildEnv`, `CYCLE_ARTIFACT_DIR` re-injected | `CLAUDE.md:80`, `docs/ENGINE.md:209` | `src/engine/walkthrough.ts:42-46`; `src/engine/run-cycle.ts:367-370` | OK |
| Media collected from `<artifactDir>/walkthrough/` into `walkthrough-artifacts.json` (`{media, count}`) | `CLAUDE.md:80`, `docs/ENGINE.md:209` | `src/engine/walkthrough.ts:64-88` | OK |
| `walkthrough_artifacts` pointer on `step.end` | `CLAUDE.md:80`, `docs/ENGINE.md:209` | `src/engine/run-cycle.ts:403` | OK |
| Non-zero hook exit → `step.end{failed}` → `cycle.end{failed, failing_step}` | `CLAUDE.md:80`, `docs/ENGINE.md:211` | `src/engine/run-cycle.ts:371-381` | OK |
| Best-effort degrade `step.walkthrough_capture_failed { cycle_id, step, artifact, error }` | `CLAUDE.md:80`, `docs/ENGINE.md:211` | `src/engine/run-cycle.ts:389-396` | OK |
| `src/engine/walkthrough.ts (95%)` per-file floor | `CLAUDE.md:39` | `scripts/coverage-gate.mjs:31` | OK |

No unbacked claims.
