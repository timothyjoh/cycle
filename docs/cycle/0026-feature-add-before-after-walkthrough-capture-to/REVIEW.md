# Review: Cycle 0026

## Overall Verdict
PASS — no fixes needed

All SPEC acceptance criteria are implemented and tested, coverage floors are met (both touched source files at 100%), `npm run typecheck` is clean, the full `test:coverage` gate exits 0, `.cycle/workflows.yml` is byte-identical to `src/defaults/workflows.yml`, PLAN.md carries a complete `## SPEC Acceptance Traceability` section, and every in-scope documentation claim is backed by a real `file:line` reference at HEAD. No code-quality, test-quality, or doc-vs-code defects rise to a NEEDS-FIX trigger.

## Code Quality Review

### Summary
A clean, minimal, additive generalization. The literal `step.name === "walkthrough_capture"` guard is replaced by membership in a declarative `WALKTHROUGH_PHASES` map, and `phase` is threaded through exactly three points (hook env, media collection, manifest write/degrade artifact) via an optional trailing parameter — so the un-phased feature path is preserved byte-for-byte. The shared mechanism is reused, not duplicated, exactly as SPEC requires.

### Findings
1. **Backward-compat correctness**: `CYCLE_WALKTHROUGH_PHASE` is conditionally spread (`...(phase ? { … } : {})`) so the feature `walkthrough_capture` env gains no new key when phase is `undefined` — `src/engine/run-cycle.ts:403`. Correct.
2. **Failure handling (fail-safe)**: A non-zero hook exit or timeout routes through the existing fatal path (`step.end {failed}` → `cycle.end {failed, failing_step}` → early return), and a `walkthrough_before` failure halts the cycle before `quick_fix` runs — `src/engine/run-cycle.ts:404-419`. Fail-safe, not fail-open.
3. **No silent failure**: The post-success collect/manifest failure is the only `catch`, and it emits a named `step.walkthrough_capture_failed` event carrying `cycle_id`, `step`, the per-phase `artifact` path, and `error` before omitting the pointer — `src/engine/run-cycle.ts:427-433`. Error is observable; cycle outcome unmasked.
4. **Idempotency**: Phase media collection is read-only; manifest writes are last-write-wins to a deterministic per-phase path. The intercept `continue`s before reset-eligible logic, so phase steps are never reset-eligible. Safe to re-run.
5. **Defensive coercion**: `walkthrough_hook_timeout_ms` is coerced at the read site (`typeof === "number" && Number.isInteger && > 0`), mirroring `max_rate_limit_retries`; absent/0/negative/NaN/Infinity/non-integer ⇒ disabled — `src/engine/run-cycle.ts:398-401`.
6. **Edge case (process-group kill)**: `execWalkthroughHook` spawns `detached: true` and kills the negative pid (whole group) so grandchildren holding pipes can't block `close`; a single-resolve `settled` guard prevents timeout+close double-resolution, and `killTree` swallows ESRCH on an already-reaped child — `src/engine/walkthrough.ts:84-110`.
7. **Subprocess discipline**: Array args, `shell:false`, curated `buildChildEnv` — compliant with project convention.

### Spec Compliance Checklist
- [x] `quickfix` contains `walkthrough_before` (between `plan_fix`/`quick_fix`) and `walkthrough_after` (final, after `verify`), both `agent: bash` no `command` — `src/defaults/workflows.yml:58,62`
- [x] `.cycle/workflows.yml` matches after `sync-defaults` (no diff; both files identical in the diff hunk)
- [x] `CYCLE_WALKTHROUGH_PHASE` passed via the `extra`/`buildChildEnv` contract — `src/engine/run-cycle.ts:403`
- [x] Distinct labeled locations `walkthrough/before/` & `walkthrough/after/` and distinct manifests `walkthrough-before/after-artifacts.json` — `src/engine/walkthrough.ts:16,134-141`
- [x] Shared mechanism reused (discovery/spawn/bounded-kill/degrade), not duplicated
- [x] Coverage floors met: `src/engine/run-cycle.ts` 100% (≥90%), `src/engine/walkthrough.ts` 100% (≥95%), globals pass
- [x] No-hook ⇒ inert skipped success per phase step
- [x] Non-zero exit/timeout ⇒ fatal routing with `finally` cleanup; `before` failure precedes the fix
- [x] Post-success collect/manifest failure ⇒ best-effort degrade event, step stays `ok`, no pointer
- [x] Hook produces no media ⇒ `ok`, no pointer, no manifest (ENOENT ⇒ `[]`)
- [x] `## Acceptance Criteria` present in SPEC.md with 8 testable bullets — `SPEC.md:34-42`
- [x] `## SPEC Acceptance Traceability` present in PLAN.md, all 8 bullets re-quoted verbatim and mapped to tasks — `PLAN.md:241-253`
- [x] Docs updated (CLAUDE.md / README.md / docs/ENGINE.md / docs/ARCHITECTURE.md)
- [x] `npm run typecheck` clean

## Adversarial Test Review

### Summary
Strong. Tests use real filesystem manipulation and real subprocesses (no `mock.method` on non-configurable ESM exports), drive the actual `runCycle` over a quickfix-shaped workflow, and pin exactly-once events with `filter(...).length === 1`. Assertions are specific (manifest `count`, exact media path arrays, pointer equality to the manifest path, phase-value round-trip through a sentinel file). Failure, degrade, timeout, and disabled paths are all exercised — not happy-path-only.

### Findings
1. **Escalation proof, not approximation**: The SIGTERM→SIGKILL unit test traps `TERM` in the hook and asserts the promise stays `pending` after SIGTERM fires, only resolving after the injected grace-timer SIGKILL — `tests/engine/walkthrough.test.ts:206-238`. Genuinely proves two-stage escalation.
2. **Kill-fallback path covered**: A stale-callback test fires timeout+grace after the child already exited, exercising the `process.kill` ESRCH → `child.kill` → swallow fallback without double-resolving — `tests/engine/walkthrough.test.ts:268-290`.
3. **Phase-env contract asserted directly**: The integration hook writes `$CYCLE_WALKTHROUGH_PHASE` into a sentinel file the test reads back, asserting `before`/`after` per step — not merely inferred — `tests/engine/run-cycle.walkthrough.test.ts` (Scenario A).
4. **Degrade isolation**: Scenario D forces `EISDIR` by pre-creating the after-manifest as a directory via a warmup run sharing the same `cycleId`/title slug, then asserts exactly one degrade event with the per-phase artifact path and an `ok` step.end with no pointer.
5. **Negative ordering assertion**: Scenario C asserts `quick_fix` produced zero events after a fatal `before` failure — confirms the fix never runs.
6. **Boundary coercion**: Non-integer (`1.5`) timeout test confirms coercion-to-disabled by proving a 0.3s hook completes rather than being killed by a ~1.5ms timer.
7. **Regression**: Existing feature `walkthrough_capture` scenarios run unmodified; YAML guard tests updated to assert the 6-step sequence and that both new steps are `agent: bash` with no `command`.

No mock-abuse, happy-path-only, weak-assertion, or test-interdependence issues found.

### Test Coverage
- Command run: `npm run test:coverage`
- Per-file (cycle-relevant): `src/engine/run-cycle.ts` 100.00% (floor 90%), `src/engine/walkthrough.ts` 100.00% (floor 95%); all other per-file floors green (triage 99.75%, commit-cycle 99.55%, queue 98.02%, exec-spawn 100%, etc.)
- Global "all files": 41.19 line / 87.60 branch / 46.66 function — spans the untested live-TUI/slash-command surface; not the gate. The gate is the per-file floor table, which passes in full (exit 0).
- Regressions vs base (per-file): none
- New code without tests: none (both touched source files at 100%)
- Specific scenarios missing tests: none

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `quickfix` shape `plan_fix → walkthrough_before → quick_fix → test_fix → verify → walkthrough_after` | `README.md:147`, `docs/ARCHITECTURE.md:406` | `src/defaults/workflows.yml:57-62` | OK |
| `WALKTHROUGH_PHASES` map gates the intercept (`walkthrough_capture → undefined`, `before`, `after`) | `CLAUDE.md:80`, `docs/ENGINE.md:203` | `src/engine/run-cycle.ts:45-49`, `src/engine/run-cycle.ts:374` | OK |
| `CYCLE_WALKTHROUGH_PHASE` passed to the hook via the `extra`/`buildChildEnv` contract | `CLAUDE.md:80`, `README.md:153`, `docs/ENGINE.md:217` | `src/engine/run-cycle.ts:403` | OK |
| Per-phase manifest `walkthrough-<phase>-artifacts.json` | `CLAUDE.md:80`, `README.md:153`, `docs/ENGINE.md:217` | `src/engine/walkthrough.ts:16` | OK |
| Phase-scoped media subdir `walkthrough/<phase>/`, paths relative to artifactDir | `docs/ENGINE.md:217` | `src/engine/walkthrough.ts:134-141` | OK |
| `engine.walkthrough_hook_timeout_ms` config field; absent/0/negative/non-integer ⇒ disabled | `CLAUDE.md:112`, `README.md:153`, `docs/ENGINE.md:215` | `src/engine/workflow.ts:59`, `src/engine/run-cycle.ts:398-401` | OK |
| `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS` = 600000, exported, not auto-applied | `CLAUDE.md:112`, `docs/ENGINE.md:215` | `src/engine/walkthrough.ts:25` | OK |
| SIGTERM→SIGKILL bounded-kill, `WALKTHROUGH_KILL_GRACE_MS` = 5000 | `CLAUDE.md:80`, `docs/ENGINE.md:213` | `src/engine/walkthrough.ts:21`, `src/engine/walkthrough.ts:102-110` | OK |
| Hook spawned `detached: true` (own process group) so kill reaches grandchildren | `docs/ENGINE.md:213` | `src/engine/walkthrough.ts:86` | OK |
| Timeout wording `… timed out (exit 143) — hook killed (SIGTERM→SIGKILL) …` via `formatWalkthroughTimeoutError` | `docs/ENGINE.md:215` | `src/engine/run-cycle.ts:224-226` | OK |
| `walkthrough_before`/`walkthrough_after` both `agent: bash`, no `command`, intercept-handled | `CLAUDE.md:80`, `docs/ENGINE.md:217` | `src/defaults/workflows.yml:58,62` | OK |

All enumerated in-scope doc claims pair with a backing reference at HEAD; no unbacked claims.

## Notes (non-blocking)
- The working tree co-resides cycle 0025's bounded-kill-timeout changes (`walkthrough_hook_timeout_ms`, `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS`, `WALKTHROUGH_KILL_GRACE_MS`, the `execWalkthroughHook` timer seam) with this cycle's phase work, per BUILD.md. The phase intercept reuses that machinery unchanged. Both bodies of work are fully tested and pass the gate; this is a commit-scoping observation, not a defect.
