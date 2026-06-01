## Summary

This cycle's work — adding phase-aware before/after walkthrough capture to the `quickfix` workflow — was discovered already fully implemented and present in the working tree on entry (a resumed build). Rather than re-author from scratch, I verified the implementation against `SPEC.md`/`PLAN.md` end-to-end, confirmed every acceptance criterion is covered, ran the full gate suite, and confirmed all four PLAN tasks are complete. The phase-aware code coexists in the same uncommitted tree with the prior cycle's bounded-kill-timeout work (cycle 0025, `engine.walkthrough_hook_timeout_ms`), which the phase intercept reuses unchanged.

**Files modified (cycle 0026 delivery):**
- `src/defaults/workflows.yml` (+6 lines in the `quickfix` block) and its synced copy `.cycle/workflows.yml` (byte-identical to defaults, verified via `git diff --no-index`) — added `walkthrough_before` (between `plan_fix` and `quick_fix`) and `walkthrough_after` (final step after `verify`), both `agent: bash` with no `command`.
- `src/engine/walkthrough.ts` (~+50 lines net for the phase layer) — added exported `walkthroughManifestName(phase?)`, and added an optional trailing `phase?` parameter to `collectWalkthroughMedia` (scans `walkthrough/<phase>/`, ENOENT⇒`[]`, paths relative to `artifactDir`) and `writeWalkthroughManifest` (writes `walkthrough-<phase>-artifacts.json`). Un-phased calls are byte-for-byte unchanged.
- `src/engine/run-cycle.ts` (~+40 lines net) — replaced the literal `step.name === "walkthrough_capture"` guard with membership in a declarative `WALKTHROUGH_PHASES` map (`walkthrough_capture → undefined`, `walkthrough_before → "before"`, `walkthrough_after → "after"`); threaded `phase` through the hook env (`CYCLE_WALKTHROUGH_PHASE`, conditionally spread so the feature env is unchanged), the collect/manifest calls, and the degrade-event `artifact` path.
- `src/engine/workflow.ts` (+6 lines) — `walkthrough_hook_timeout_ms?` on `EngineConfig` (reused by the phase intercept's bounded-kill).
- `tests/engine/run-cycle.walkthrough.test.ts` (+295) and `tests/engine/walkthrough.test.ts` (+199) and `tests/defaults/quickfix-yaml.test.ts` (+20) — new scenarios (enumerated below).
- `CLAUDE.md`, `README.md`, `docs/ENGINE.md`, `docs/ARCHITECTURE.md` — phase-aware intercept, `CYCLE_WALKTHROUGH_PHASE` env contract, per-phase manifest naming, the two new `quickfix` steps, and the updated `quickfix` workflow shape.

**PLAN.md task status:** Task 1 (phase-parameterized helpers + `walkthroughManifestName`) — complete. Task 2 (phase-aware `run-cycle` intercept via `WALKTHROUGH_PHASES`) — complete. Task 3 (`quickfix` workflow steps + `sync-defaults`) — complete, `.cycle/workflows.yml` is byte-identical to `src/defaults/workflows.yml`. Task 4 (CLAUDE.md / README.md / docs/ENGINE.md / docs/ARCHITECTURE.md) — complete.

**Test suite:** `npm test` → `tests 921 / pass 921 / fail 0`, exit 0. `npm run typecheck` (`tsc --noEmit`) clean, no warnings.

**Coverage:** `npm run test:coverage` (which chains `posttest:coverage` → `coverage-gate.mjs` + `structural-invariants.mjs`), exit 0. Per-file floors relevant to this cycle: `src/engine/run-cycle.ts` **100.00%** (≥ 90%), `src/engine/walkthrough.ts` **100.00%** (≥ 95%). All other per-file floors pass (triage 99.75%, commit-cycle 99.55%, reflection 99.77%, queue 98.02%, etc.); no per-file regression. All structural invariants pass. Global "all files" line shows 41.19 / 87.60 / 46.66 — that figure spans the entire repo including the untested live-TUI/slash-command surface and is not the gate; the gate is the per-file floor table, all green.

**Failure modes handled and the tests covering them:**
- *No hook configured (cycle's own repo default):* each phase step is inert — one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no failure. Covered by `quickfix walkthrough phases skip clean when no hook is configured` (cardinality-pinned `filter(...).length === 1`).
- *Non-zero hook exit / timeout (fatal):* routes through the existing fatal step-failure path — `step.end { status: "failed", exit_code, stderr }` → `cycle.end { status: "failed", failing_step }` → early return, with `finally` cleanup still running; timeout wording via `formatWalkthroughTimeoutError`. A `walkthrough_before` failure fails the cycle before the fix is applied. Covered by `quickfix walkthrough_before failure is fatal and quick_fix does not run` (asserts no `step.start`/`step.end` for `quick_fix`) and, for the un-phased path, `walkthrough_capture times out a hung hook…`.
- *Post-success collect/manifest-write failure (best-effort degrade):* emits exactly one `step.walkthrough_capture_failed { cycle_id, step, artifact, error }` (artifact = per-phase manifest path), omits the pointer, keeps `step.end { status: "ok" }`, never masks the cycle outcome — no silently swallowed error. Covered by `quickfix walkthrough_after degrades via step.walkthrough_capture_failed when the per-phase manifest write fails` (forces `EISDIR` by pre-creating the manifest path as a directory).
- *Hook produces no media in a phase:* `step.end { status: "ok" }`, no pointer, no manifest (`collectWalkthroughMedia` returns `[]` on ENOENT). Covered at the unit level in `tests/engine/walkthrough.test.ts` (missing phase subdir ⇒ `[]`; non-ENOENT readdir error still throws; manifest-path-is-directory ⇒ `EISDIR` throws).
- *Phase-env contract:* the hook receives `CYCLE_WALKTHROUGH_PHASE=before|after`. Covered by `quickfix walkthrough phases write labeled media, per-phase manifests, pointers, and pass CYCLE_WALKTHROUGH_PHASE`.
- *Idempotency:* the intercept sits after retry-skip/`skip_unless` gates and `continue`s before reset-eligible logic, so the phase steps are never reset-eligible; manifest writes are last-write-wins to deterministic per-phase paths.

**Backward compatibility:** the existing `feature` `walkthrough_capture` scenarios in `tests/engine/run-cycle.walkthrough.test.ts` pass unmodified — `WALKTHROUGH_PHASES.get("walkthrough_capture")` is `undefined`, so the env (no `CYCLE_WALKTHROUGH_PHASE` key, conditionally spread), media dir (`walkthrough/`), and manifest (`walkthrough-artifacts.json`) are preserved byte-for-byte.

**Deviations from PLAN.md:** None functional. The only divergence from the planned flow is process, not design — the implementation was already in the tree on entry, so this step was verification + gate-running rather than authoring. The `WALKTHROUGH_MANIFEST` named import was dropped from `run-cycle.ts` (all references moved to `walkthroughManifestName`), as the PLAN's risk-assessment anticipated; typecheck is clean.

**Deferred / follow-up:** None for this cycle. Note for the record: cycle 0025's bounded-kill-timeout changes (`walkthrough_hook_timeout_ms`, `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS`, `WALKTHROUGH_KILL_GRACE_MS`, the `execWalkthroughHook` timer seam) are co-resident uncommitted in this working tree and are reused — not modified — by the phase intercept; they are tracked under cycle 0025.

## Touched Files
- src/defaults/workflows.yml
- .cycle/workflows.yml
- src/engine/run-cycle.ts
- src/engine/walkthrough.ts
- src/engine/workflow.ts
- tests/engine/run-cycle.walkthrough.test.ts
- tests/engine/walkthrough.test.ts
- tests/defaults/quickfix-yaml.test.ts
- CLAUDE.md
- README.md
- docs/ENGINE.md
- docs/ARCHITECTURE.md
