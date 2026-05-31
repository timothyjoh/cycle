All gates green. Writing the build summary.

## Summary

Cycle 0012 makes a failed `bash` step self-diagnosable from the engine log by capturing its stdout (where test runners and build tools print failure detail) while leaving the success path and all agent steps untouched.

**Files modified/created:**
- `src/engine/run-cycle.ts` (+30 lines): added the `MAX_STEP_END_STDOUT = 2000` cap constant beside `MAX_STEP_END_STDERR` (Task 1); inserted a double-gated (`step.agent === "bash" && r.status === "failed"`) capture block before the `step.end` emit that writes the full stdout+stderr to `<artifactDir>/<step>.out` (header layout `=== stdout ===\n…\n=== stderr ===\n…\n`), records the resolved path in `stdoutArtifact`, and on write failure emits `step.output_capture_failed` and leaves the pointer unset; extended the `step.end` spread with conditional `stdout` (capped excerpt) and `stdout_artifact` (pointer) fields (Task 2).
- `tests/engine/run-cycle.step-end-stdout.test.ts` (new, 261 lines): five integration scenarios driving the real `runCycle` against temp git repos.
- `CLAUDE.md` (+1 paragraph) and `docs/ENGINE.md` (+1 section): documented the new fields, the `.out` artifact format, and the best-effort degrade behavior (Task 4). No `AGENTS.md` exists; `README.md` unchanged per SPEC (engine-internal observability).

**PLAN.md tasks complete:** Task 1 (cap constant), Task 2 (capture block + `step.end` fields), Task 3 (tests), Task 4 (docs) — all four.

**Test suite:** `npm test` → **817 tests, 817 pass, 0 fail**. `npm run typecheck` clean. `npm run test:coverage` (+ `check:coverage` via `posttest:coverage`): all per-file floors hold; **`src/engine/run-cycle.ts` at 99.65% ≥ 90%** floor (no regression). Structural invariants pass.

**Failure modes handled:**
- *Write failure (degrade, not throw)* — the `.out` `writeFile` is wrapped in `try/catch`; on error it emits `step.output_capture_failed { cycle_id, step, artifact, error }`, omits `stdout_artifact`, and preserves the original `exit_code`, the capped `stdout` excerpt, the `step.end` event, and terminal-failure routing. Covered by scenario 4, which forces a deterministic `EISDIR` by pre-creating `verify.out` as a directory (root-proof — `chmod 0o500` does not block writes when running as root, a flakiness mode the PLAN anticipated; I used the PLAN's suggested fallback of a guaranteed-failing path instead).
- *Empty output on failure* — header-only `.out` written so the pointer never dangles; `stdout` excerpt is an empty string, no crash. Covered by scenario 3.
- *Idempotency* — the write is a deterministic-path `writeFile` (last-write-wins); bash steps are excluded from all skip/proof machinery so the artifact never gates control flow. A retried cycle simply overwrites the file.
- *Capping* — oversized stdout truncated to `MAX_STEP_END_STDOUT` with the `…` marker in the event while the artifact holds full text. Covered by scenario 5. Happy-path field/file absence covered by scenario 2; marker-in-excerpt + full-artifact + pointer covered by scenario 1.

**Deviations from PLAN.md:** One — scenario 4's write-failure injection uses an `EISDIR`-forcing directory at the `.out` path (via an explicit `cycleId` to reuse the artifact dir across two runs) rather than `chmod 0o500`, because the test runs as root where mode bits are ignored. This is the PLAN's own documented fallback ("alternatively pointing the write at a guaranteed-nonexistent nested path if `chmod` proves unreliable") and asserts the identical observable contract.

**Deferred/follow-up:** None. Output compression/summarization remains out of scope (tracked in `feat-compress-step-output`).

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.step-end-stdout.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/ARCHITECTURE.md
