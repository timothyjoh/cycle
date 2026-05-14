Context complete. Emitting PLAN.md to stdout.

```markdown
# Implementation Plan: Cycle 0058

## Overview
Add a post-condition byte-floor guard at the `spec` step's artifact-write seam in `src/engine/run-cycle.ts` so an empty or near-empty `SPEC.md` (post-sanitization) causes the step to fail loudly with a greppable error and routes through the existing `cycle.end status:"failed" failing_step:"spec"` retry path instead of silently corrupting the downstream `plan` → `build` → `review` chain.

## Current State (from Research)
- `src/engine/run-cycle.ts:132-153` holds the rebindable `let r: StepResult` plus the agent-branch artifact-write block. `writeFile(join(artifactDir, …UPPERCASE.md), sanitizeArtifactStdout(r.stdout), "utf8")` at line 147 is the single insertion point — `step.end` is emitted at line 153 from `r.status` / `r.exitCode`, so mutating `r` between 147 and 153 is enough to surface a failure without a new code path.
- The default failed-step branch at 154-165 short-circuits only `reflection` and `documentation`. `step.name === "spec"` falls through naturally to `cycle.end status:"failed" failing_step:"spec"` + early return.
- `sanitizeArtifactStdout` (`src/engine/sanitize-artifact.ts:5`) is pure / idempotent and already called at the write seam — guard reuses its return value (compute once, store in a `const`).
- Test infrastructure: Node native `node:test`, real `git init` tempdirs, fake `claude` binary via `PATH` override (`tests/engine/run-cycle.sanitize.test.ts:30-80` is the closest precedent). `workflowYml(stepsBody)` helper inlines an engine/triage/workflows skeleton; `no_branch:true` is not in the helper and existing tests inline their own YAML when they need it.
- Bash-step seam is **not** valid for the guard — `execBashStep` skips the agent-branch artifact write entirely. Stub must run through `resolveAgent` (fake `claudecode` binary under PATH).
- `src/engine/run-cycle.ts` has no per-file floor in `coverage-gate.mjs`; only aggregate baselines apply (line ≥ 95%, branch ≥ 75%, function ≥ 90%). Existing per-file floor on `triage.ts` is untouched.

## Desired End State
- `runCycle` rejects any `spec` agent step whose post-sanitization payload is `< 200` UTF-8 bytes by mutating `r.status` to `"failed"`, `r.exitCode` to `r.exitCode || 1`, and `r.stderr` to `spec post-condition failed: <abs-path> is <N> bytes (< 200)` before `step.end` emits. The cycle terminates via the existing failing-step branch; no new event types, no new payload keys.
- A new test file `tests/engine/run-cycle.spec-guard.test.ts` exercises empty / under-threshold / at-threshold scenarios against both branch-based and `no_branch:true` workflows via a stubbed `claudecode` agent.
- `CLAUDE.md` carries a one-line bullet under `## Architecture quick reference` describing the `SPEC_MIN_BYTES` post-condition adjacent to the existing `Artifact sanitization` bullet.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` (with per-file gate + aggregates) all pass.
- Verification:
  - `grep -n SPEC_MIN_BYTES src/engine/run-cycle.ts` shows one module-level constant.
  - The new test file passes in isolation: `node --test --experimental-strip-types tests/engine/run-cycle.spec-guard.test.ts`.
  - `npm run sync-defaults` is **not** needed (no `src/defaults/` edits in the load-bearing path; see Task 4 for the optional prompt tweak).

## What We're NOT Doing
- No generalized `post:` / `assert:` schema in `workflows.yml`. Single-call-site need does not justify a new schema dimension. Defer until a second post-condition need surfaces.
- No guards on `PLAN.md`, `BUILD.md`, `REVIEW.md`, `FIX.md`, or other artifact files. Only `SPEC.md` this cycle.
- No threshold-tuning beyond the chosen 200-byte floor. If 200 proves wrong, that's a future reflection issue.
- No backfill of cycle 0023's empty `SPEC.md`. Out of scope per SPEC.
- No prompt-side hardening beyond at most one new line in `src/defaults/prompts/spec.md` — engine guard is load-bearing regardless. Treated as optional polish (Task 4); skip if it forces any restructuring.
- No `cli.ts` drain-loop change. Terminal failure plumbing is reused as-is.
- No new helper module / no new sanitizer / no refactor of the artifact-write seam.
- No new exit codes, no new event types.

## Implementation Approach
Single load-bearing change: insert ~6 lines into `run-cycle.ts` between the existing `writeFile` (line 147) and the `step.end` emit (line 153). The sanitized payload is computed once into a `const sanitized = sanitizeArtifactStdout(r.stdout)`, written via the existing `writeFile`, then measured with `Buffer.byteLength(sanitized, "utf8")`. If `step.name === "spec"` and bytes `< SPEC_MIN_BYTES`, mutate `r` in place (field assignment, not rebind — `r` is `let`-bound but field-level mutation is lower-noise and matches SPEC's "mutate the step result" wording).

`SPEC_MIN_BYTES = 200` lives as a single named module constant near the top of the file (adjacent to other module-level imports/constants). Strict `<` boundary: exactly 200 bytes passes.

Test seam: stubbed `claudecode` agent. The fake `claude` shell script under a PATH-override tempdir `printf`s a controlled byte payload — same pattern as `run-cycle.sanitize.test.ts`. For at-threshold, `printf` an exactly-200-byte string. For under-threshold, `printf` ~50 bytes. For empty, `printf ''`. Workflow truncated to a single `spec` step so the at-threshold scenario doesn't drag downstream steps into the assertion surface; for failure scenarios the same single-step workflow is sufficient (failure is asserted before `research` would have started anyway).

Parameterization across branch / `no_branch`: extend `workflowYml(stepsBody, opts?: { noBranch?: boolean })` with an optional flag (lower-cost than duplicating YAML). The helper currently lives inside `run-cycle.sanitize.test.ts`; the new test file gets its own local copy of the helper to avoid cross-file coupling — this matches the prevailing pattern (each `run-cycle.*.test.ts` file owns its own helper today).

---

## Task 1: Add `SPEC_MIN_BYTES` constant + post-write guard in `run-cycle.ts`

### Overview
Insert the named threshold constant and the guard branch at the artifact-write seam. The guard runs unconditionally for any step whose `step.name === "spec"` and whose post-sanitization payload is `< SPEC_MIN_BYTES`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

1. Add module-level constant near the top of the file (after imports, before `runCycle`):

   ```ts
   const SPEC_MIN_BYTES = 200;
   ```

2. Refactor the existing write seam at line 146-148 to compute the sanitized payload once, then add the guard immediately after the `writeFile`:

   ```ts
   if (r.status === "ok" && step.name) {
     const sanitized = sanitizeArtifactStdout(r.stdout);
     const artifactPath = join(artifactDir, `${step.name.toUpperCase()}.md`);
     await writeFile(artifactPath, sanitized, "utf8");
     if (step.name === "spec") {
       const bytes = Buffer.byteLength(sanitized, "utf8");
       if (bytes < SPEC_MIN_BYTES) {
         r.status = "failed";
         r.exitCode = r.exitCode || 1;
         r.stderr = `spec post-condition failed: ${artifactPath} is ${bytes} bytes (< ${SPEC_MIN_BYTES})`;
       }
     }
   }
   ```

3. Leave lines 149-153 (`reflection` ingestion + `step.end` emit) untouched. The `step.end` emit at line 153 reads `r.status` / `r.exitCode` and will now naturally emit `status: "failed", exit_code: 1` for under-threshold spec output.

4. Leave the failed-step branch at 154-165 untouched. `step.name === "spec"` falls through to the default branch, which emits `cycle.end status:"failed" failing_step:"spec"` and returns `{ cycleId, status: "failed", failingStep: "spec" }`.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` clean.
- [ ] `grep -n SPEC_MIN_BYTES src/engine/run-cycle.ts` shows exactly one definition site + two reference sites (the threshold check and the error string).
- [ ] No call-site magic numbers; the literal `200` appears only in the `SPEC_MIN_BYTES` constant declaration.
- [ ] `sanitized` is computed once; `writeFile` and `Buffer.byteLength` consume the same local.
- [ ] No new imports needed (`Buffer` is global; `writeFile`, `join`, `sanitizeArtifactStdout` already imported).
- [ ] No change to `step.end` event shape, no new event types, no change to the failed-step branch.

---

## Task 2: Regression test — `tests/engine/run-cycle.spec-guard.test.ts`

### Overview
Add a new test file driving `runCycle` against a tempdir repo with a stubbed `claudecode` agent. Cover the three byte-payload scenarios across two workflow shapes (branch-based and `no_branch:true`).

### Changes Required

**File**: `tests/engine/run-cycle.spec-guard.test.ts` (new)

Structure mirrors `tests/engine/run-cycle.sanitize.test.ts`. Local `workflowYml(stepsBody, opts?: { noBranch?: boolean })` helper extends the sanitize-file helper with an optional `no_branch: true` line under each workflow entry. Local `git(cwd, args)` helper identical to the sanitize file.

Key fixture seam: a fake `claude` shell script under a PATH-prepended tempdir that `printf`s a controlled payload. The payload size is the variable under test.

Test cases (parameterized over `noBranch ∈ {false, true}` — 6 tests total, or 3 tests with an inner loop; pick whichever produces cleaner assertions, defaulting to an inner `for` loop for terseness):

1. **Empty payload fails the guard.**
   - Fake `claude` runs `printf ''`.
   - Assert `r.status === "failed"`, `r.failingStep === "spec"`.
   - Assert `.cycle/log.jsonl` matches `/"event":"step.end","cycle_id":"\d+","step":"spec","status":"failed","exit_code":1/`.
   - Assert `.cycle/log.jsonl` matches `/"event":"cycle.end","cycle_id":"\d+","status":"failed","failing_step":"spec"/`.
   - Assert `.cycle/log.jsonl` does **not** match `/"event":"step.start".*"step":"research"/`.

2. **Under-threshold (~50 bytes) fails the guard and surfaces the greppable error string.**
   - Fake `claude` `printf`s a ~50-byte string containing no narration prefix (so sanitization is a no-op).
   - Same log assertions as case 1.
   - Read `SPEC.md` from the artifact dir and assert it equals the ~50-byte payload (the failing write still happens; the corrupt artifact remains for archaeology).
   - Additionally, assert that the failure error is observable. Two options, plan picks the simpler:
     - **Chosen:** expose `r.stderr` indirectly by re-running `runCycle` against the same fixture and asserting `result.failingStep === "spec"` (already covered) and patching `tests/engine/run-cycle.spec-guard.test.ts` to call `runCycle` with a captured `log` writer... **scratch that** — `runCycle`'s `LogEmitter` writes to `.cycle/log.jsonl` only, and `step.end` does not carry `stderr` today. To assert the greppable error string, the test instead reads the spawned-process stderr indirectly is not possible without changing the engine.
     - **Actual chosen approach:** assert the error string indirectly via a second runCycle invocation that wires a `console`-spying or `LogEmitter` interceptor — **not** clean. Instead, **broaden the assertion**: the test asserts the public observables defined by SPEC §Acceptance — `step.end status:"failed", exit_code:1`, `cycle.end status:"failed", failing_step:"spec"`, no `research` `step.start`, and the byte-count threshold boundary. The error-string format itself is asserted via a **direct unit-style test** in Task 3 below, which calls a small extracted check inline.

   Rationale: `step.end` carries `status` + `exit_code` but not `stderr`. SPEC §Acceptance bullet "The guard's error string contains the absolute artifact path, the actual byte count, and the threshold value (asserted by regression test)" must still hold. Resolution: assert the error string in a **dedicated assertion** in the test by reading `r.stderr` via the `runCycle` return value... `runCycle` returns `{ cycleId, status, failingStep? }` and does **not** propagate `r.stderr`. To stay within the no-new-events constraint, Task 3 directly tests `Buffer.byteLength` + the format-string by **extracting the byte-floor check into a small testable helper** OR by adding `stderr_excerpt` to `step.end`. The cheaper move: keep the engine inline mutation, and in Task 2 also pipe the `log` stream through `child_process` so we can grep for the error string in the dev-test console... no, `log.emit` does not write to console.

   **Final resolution (locked):** Add a single new `step.end` payload key — `stderr_excerpt?: string` (head-kept, capped at 512 chars) — emitted ONLY when `status === "failed"` and `r.stderr` is non-empty. This is the smallest delta that lets the regression test assert the error string from `.cycle/log.jsonl` without inventing a new event type. **However** SPEC §Requirements explicitly states "No new event types, no new event payload keys." — so this is out of scope.

   **Truly final resolution:** Drop the SPEC.md byte-count + path + threshold from the in-log assertion surface and instead assert it via direct test of the format string. The test reads the failing-cycle's `SPEC.md` file from disk (proves the under-threshold payload was the one written), computes the expected error string locally with the same threshold + path + byte count, and asserts via a small `formatGuardError(path, bytes, threshold)` helper exported from `run-cycle.ts`. Task 3 covers this.

3. **At-threshold (exactly 200 bytes) passes the guard.**
   - Fake `claude` `printf`s a 200-byte string (e.g. a 199-char run of `x` plus newline, or 200 chars without newline — pick whichever measures exactly 200 bytes after sanitization). Sanitization will be a no-op for a plain-text payload with no narration prefix and no enclosing fence.
   - Workflow has only the `spec` step (no `research` onward) so the cycle terminates `ok` after `spec`.
   - Assert `r.status === "ok"`.
   - Assert `.cycle/log.jsonl` matches `/"event":"step.end","cycle_id":"\d+","step":"spec","status":"ok"/`.
   - Assert `SPEC.md` exists and has 200 bytes.

Parameterization: outer `for (const noBranch of [false, true])` loop creates two tests per scenario, with `workflowYml(stepsBody, { noBranch })` emitting `no_branch: true` under the workflow entry when set. For `noBranch: true`, the test must also seed `cycleEnv.CYCLE_BASE = "main"` and skip the implicit base-branch fetch (the sanitize test already follows this pattern).

### Success Criteria
- [ ] File compiles under `tsc --noEmit`.
- [ ] `node --test --experimental-strip-types tests/engine/run-cycle.spec-guard.test.ts` passes all scenarios.
- [ ] Each scenario uses a fresh tempdir (`mkdtemp`) and cleans up in `finally`.
- [ ] No mocks. Real `runCycle`, real `git init`, real fake-binary PATH override.
- [ ] Log-walk assertions match the failing-step regression pattern at `tests/engine/run-cycle.test.ts:126-179`.

---

## Task 3: Export and unit-test the error-string formatter

### Overview
SPEC §Acceptance requires the error string to be asserted by a regression test, but `step.end` does not propagate `stderr` and SPEC forbids adding new payload keys. Resolve by exporting a tiny pure formatter from `run-cycle.ts` and asserting it directly.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Extract the error-string format into an exported pure helper near the `SPEC_MIN_BYTES` constant:

```ts
export const SPEC_MIN_BYTES = 200;

export function formatSpecGuardError(path: string, bytes: number, threshold: number): string {
  return `spec post-condition failed: ${path} is ${bytes} bytes (< ${threshold})`;
}
```

Update the guard branch in Task 1 to use this helper:

```ts
r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
```

**File**: `tests/engine/run-cycle.spec-guard.test.ts`

Add one direct test for the formatter:

```ts
test("formatSpecGuardError: stable greppable shape", () => {
  const out = formatSpecGuardError("/abs/path/SPEC.md", 42, 200);
  assert.equal(out, "spec post-condition failed: /abs/path/SPEC.md is 42 bytes (< 200)");
  assert.match(out, /^spec post-condition failed: /);
  assert.match(out, /is 42 bytes \(< 200\)$/);
});

test("SPEC_MIN_BYTES is 200", () => {
  assert.equal(SPEC_MIN_BYTES, 200);
});
```

### Success Criteria
- [ ] `formatSpecGuardError` and `SPEC_MIN_BYTES` are both exported from `run-cycle.ts`.
- [ ] Formatter is pure (no I/O, no side effects, deterministic).
- [ ] Direct test asserts both the exact string and the regex-greppable shape.
- [ ] Engine guard uses the same formatter — single source of truth for the error message.

---

## Task 4: Documentation update — `CLAUDE.md`

### Overview
Add one bullet to `## Architecture quick reference` describing the spec post-condition guard, adjacent to the existing `Artifact sanitization` bullet.

### Changes Required

**File**: `CLAUDE.md`

Locate the existing `Artifact sanitization:` bullet under `## Architecture quick reference` and insert immediately after it:

```markdown
- Spec post-condition: `src/engine/run-cycle.ts:SPEC_MIN_BYTES` (currently 200) gates the `spec` step. After the existing artifact write at the agent-branch seam, the engine measures `Buffer.byteLength(sanitizeArtifactStdout(stdout), "utf8")` and, when `< SPEC_MIN_BYTES`, mutates `r.status = "failed"` with stderr `spec post-condition failed: <abs-path> is <N> bytes (< <THRESHOLD>)` before `step.end` emits. The failure falls through the standard `cycle.end status:"failed" failing_step:"spec"` branch — same retry path as any other terminal step failure. Boundary is strict `<` (exactly `SPEC_MIN_BYTES` passes). Fires identically for branch-based and `no_branch:true` workflows.
```

### Success Criteria
- [ ] Bullet is placed adjacent to the `Artifact sanitization` bullet.
- [ ] Bullet describes the constant location, what is measured, the failure path, and the boundary semantics — matches SPEC §Documentation Updates.
- [ ] No edits to `README.md` (no user-facing surface change).

---

## Task 5 (optional polish): One-line spec prompt reminder

### Overview
Per SPEC §Documentation Updates, "at most one new line" under the Output section of `src/defaults/prompts/spec.md` reminding the agent that an under-threshold SPEC.md fails the step. Only if it fits without restructuring; skip otherwise. The engine guard is load-bearing regardless.

### Changes Required

**File**: `src/defaults/prompts/spec.md`

If the existing Output section ends with a single trailing instruction line, append one bullet/line below it:

```markdown
- A SPEC.md under 200 bytes fails the spec step automatically — write the full Objective / Scope / Acceptance Criteria block, not a placeholder.
```

If adding this line would require restructuring the Output section, skip the task entirely.

If Task 5 is performed, also run `npm run sync-defaults` so the dogfood `.cycle/prompts/spec.md` picks up the change. `sync-defaults` will refuse to overwrite locally-divergent destinations (exit 2) — if it refuses, inspect the divergence and re-run with `--force` only if the divergence is the prior un-synced default (do not blindly force).

### Success Criteria
- [ ] Either: one new line added under Output AND `npm run sync-defaults` clean OR force-confirmed by visual diff inspection.
- [ ] Or: task skipped because no clean insertion point exists.

---

## Testing Strategy

### Unit Tests
- `formatSpecGuardError` shape + exact string (Task 3 direct test).
- `SPEC_MIN_BYTES` value pinned (Task 3 direct test) so a future inadvertent retune trips a test.
- Mocking: none. Pure helper, deterministic. Engine integration uses real `runCycle` + real fake-binary PATH override (no agent SDK mocks).

### Integration / E2E Tests
- `tests/engine/run-cycle.spec-guard.test.ts` (Task 2):
  - Empty (0-byte) payload → step.end failed + cycle.end failed + no `research` step.start. ×2 (branch, no_branch).
  - Under-threshold (~50-byte) payload → same log assertions + on-disk SPEC.md content matches the corrupt payload. ×2 (branch, no_branch).
  - At-threshold (exactly 200-byte) payload → step.end ok + cycle.end ok + on-disk SPEC.md is 200 bytes. ×2 (branch, no_branch).
- Existing `tests/engine/run-cycle.sanitize.test.ts` continues to pass without modification (its build-step payload is >> 200 bytes, and the guard only fires on `step.name === "spec"`).
- Existing `tests/engine/run-cycle.test.ts` and all other `run-cycle.*.test.ts` files continue to pass; their happy-path spec steps already produce > 200-byte payloads.
- Full suite: `npm test` passes (existing + new).
- Coverage: `npm run test:coverage` clean per aggregate baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%) and the per-file `triage.ts ≥ 95%` floor remains untouched.

### Anti-mock note
Spec calls for "real implementations over heavy mocking." This plan uses zero mocks. The fake `claude` binary is a real shell script invoked through real `spawn` via the real `resolveAgent` path — same seam every other `run-cycle.*.test.ts` file uses for agent stubbing.

## Risk Assessment

- **Risk:** A passing legacy test that happens to use a < 200-byte stub `spec` payload now fails.
  - **Mitigation:** Search for `step.name === "spec"` and `step: "spec"` usages in `tests/` before commit. The current grep target is `tests/engine/run-cycle.*.test.ts` — none of the existing files run a stub through the `claudecode` agent for the `spec` step today (most spec payloads in tests are skipped or are long-form). If any are found, they are extended to emit `≥ 200` bytes (a one-line `printf` fix).

- **Risk:** A workflow ordering change (e.g. someone renames `spec` to `specification`) silently disables the guard.
  - **Mitigation:** The guard keys on `step.name === "spec"` — same string the failing-step branch uses for `failing_step: step.name`. Pinning this name in the regression test ties the contract to the literal `"spec"`. Acceptable per SPEC §Open Questions: "any future workflow adding a `spec` step inherits the contract — this is intended."

- **Risk:** Sanitization removes legitimate content and pushes a real spec under 200 bytes.
  - **Mitigation:** `sanitizeArtifactStdout` only strips narration prefix lines (`Now|Next|Here is|Output …`) and a single outer fence. A real spec body is opaque to the sanitizer. Empirically, every existing real `SPEC.md` in `docs/cycle/*/SPEC.md` is multi-kilobyte. The 200-byte floor is generous — a real spec would have to be pathologically truncated to trip it. Future calibration is its own reflection issue per SPEC §Out of Scope.

- **Risk:** A bash `spec` step (hypothetical future workflow variant) bypasses the guard because `execBashStep` skips the agent-branch artifact write.
  - **Mitigation:** Documented in RESEARCH §Open Questions and CLAUDE.md bullet. The current default workflow has no bash `spec` step. If a future workflow adds one, that workflow's authors must wire the post-condition themselves OR move the guard to a position that handles both branches — a deliberate future-work boundary, not a regression.

- **Risk:** `r.exitCode = r.exitCode || 1` clobbers a legitimate non-zero exit code from the agent.
  - **Mitigation:** The guard branch only fires when `r.status === "ok"` (the enclosing `if` at line 146 is `if (r.status === "ok" && step.name)`), so `r.exitCode` is already 0 when the guard runs. `0 || 1 === 1` — the assignment is unconditional in practice. Field-level mutation is safe.
```

End-of-turn: plan written to stdout for engine capture as `docs/cycle/0058-feature-enforce-spec-md-non-empty-contract-befor/PLAN.md`.
