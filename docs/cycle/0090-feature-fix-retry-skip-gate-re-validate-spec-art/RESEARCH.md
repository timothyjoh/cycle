I have all the information needed. Writing the research document to stdout now.

```markdown
# Research: Cycle 0090

## Cycle Context

The spec asks to extend `shouldSkipForArtifact` in `src/engine/run-cycle.ts` so
that a `SPEC.md` artifact whose UTF-8 byte length is below `SPEC_MIN_BYTES` (200)
is treated as absent on retry pops — causing the spec step to re-run rather than
being silently skipped with `reason: artifact_present`. The fix is scoped to the
`spec` branch only; `research` and `plan` keep their `> 0` bytes semantics.
A regression test must be added, and the CLAUDE.md architecture note must be
updated to reflect the stricter gate.

## Current Codebase State

### Relevant Components

- **`shouldSkipForArtifact`** — async helper that decides whether to skip a step
  on retry. Uses `stat()` only; returns `{ skip: true, artifactPath }` when
  `st.isFile() && st.size > 0`. No byte-floor re-validation for `spec`.
  — `src/engine/run-cycle.ts:31-44`

- **`SKIP_ELIGIBLE_STEPS`** — `Set(["spec", "research", "plan"])`. Steps not in
  this set immediately return `{ skip: false }`.
  — `src/engine/run-cycle.ts:29`

- **`SPEC_MIN_BYTES`** — exported constant, value `200`.
  — `src/engine/run-cycle.ts:46`

- **`formatSpecGuardError`** — exported helper that formats the stderr message
  for a below-threshold spec artifact.
  — `src/engine/run-cycle.ts:52-54`

- **Spec post-condition guard in `runCycle`** — runs after the artifact-write
  seam (line 196-204). Measures `Buffer.byteLength(sanitized, "utf8")` and
  mutates `r.status = "failed"` when `< SPEC_MIN_BYTES`. This is the original
  guard that rejects a stub spec on attempt 0.
  — `src/engine/run-cycle.ts:198-205`

- **Retry-skip block in `runCycle`** — calls `shouldSkipForArtifact` when
  `attempt > 0 && skipEnabled && !isResumeEntry && step.agent !== "bash"`.
  Emits `step.skipped { reason: "artifact_present" }` and `continue`s on
  `gate.skip === true`.
  — `src/engine/run-cycle.ts:143-154`

- **`readFile` import** — already imported from `node:fs/promises` at line 20.
  Available to use inside `shouldSkipForArtifact` without new imports.
  — `src/engine/run-cycle.ts:20`

### Existing Patterns to Follow

- **`stat()` + catch pattern**: current `shouldSkipForArtifact` wraps `stat()` in
  a try/catch, treating any error (including ENOENT) as absent
  — `src/engine/run-cycle.ts:38-42`. The spec's ENOENT-as-absent requirement on
  the `readFile` call should follow the same catch-and-fall-through shape.

- **`Buffer.byteLength(content, "utf8")`**: already used at the spec-guard seam
  in `runCycle` to measure sanitized content — `src/engine/run-cycle.ts:199`.
  Same expression applies in `shouldSkipForArtifact` for the `spec` branch.

- **`readFile` already imported**: no new import needed — `src/engine/run-cycle.ts:20`.

- **Direct `shouldSkipForArtifact` unit tests**: existing tests in
  `run-cycle.skip-completed.test.ts` call `shouldSkipForArtifact` directly,
  creating a temp dir, writing a file, and asserting `r.skip`.
  — `tests/engine/run-cycle.skip-completed.test.ts:84-134`

- **`BIG` constant** — `"x".repeat(300)` defined at line 82 of the skip-completed
  test file; used to seed artifacts guaranteed to clear `SPEC_MIN_BYTES`.
  The new test for below-threshold needs a payload of 1–199 bytes (e.g.,
  `"x".repeat(199)` which is 199 bytes, one below threshold).

- **`try / finally` cleanup pattern**: all integration tests in
  `run-cycle.skip-completed.test.ts` wrap assertions in `try/finally` with
  `rm(root, { recursive: true, force: true })`.

### Dependencies & Integration Points

- **`shouldSkipForArtifact` call site** — only one call site exists, in
  `runCycle`'s per-step loop. The function signature and return type are
  unchanged by this fix; only the internal logic for `stepName === "spec"` changes.
  — `src/engine/run-cycle.ts:144`

- **`SPEC_MIN_BYTES` already exported** — importable from `run-cycle.ts` without
  duplication; already imported in `run-cycle.spec-guard.test.ts:9`.

- **`sanitizeArtifactStdout` is NOT involved** — `shouldSkipForArtifact` reads the
  already-written disk artifact, which was sanitized at the prior write seam
  (line 195-196). The on-disk content is post-sanitization bytes, so raw
  `readFile` byte measurement is correct.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`). Import pattern:
  `import { test } from "node:test"` + `import { strict as assert } from "node:assert"`.

- **Test file for this fix**: `tests/engine/run-cycle.skip-completed.test.ts`.
  This is where all `shouldSkipForArtifact` unit tests live (lines 84-134) and
  where the regression test belongs. The integration tests for `runCycle` retry
  skip also live here.

- **`shouldSkipForArtifact` import**: already imported at line 7 of
  `run-cycle.skip-completed.test.ts`.

- **Existing `shouldSkipForArtifact` tests that will become stale after the fix**:
  - Line 84: `"skip when artifact exists with > 0 bytes"` — seeds `"hi"` (2 bytes)
    and asserts `skip: true`. After the fix, 2 bytes < 200 → `skip: false`. **This
    test will break** and must be updated: the seed must be ≥ 200 bytes to still
    assert `skip: true`.
  - Lines 202-229: `"attempt=1: only SPEC.md seeded → skip spec, run research+plan"`
    — seeds `spec: BIG` (300 bytes ≥ 200) so this test remains correct.
  - Lines 164-200: `"attempt=1: all three artifacts present"` — seeds `spec: BIG`
    (300 bytes ≥ 200), remains correct.
  - Lines 257-281: `"attempt=1 with zero-byte SPEC.md: spec runs"` — seeds `""`,
    already asserts `skip: false`; behavior unchanged.
  - Lines 333-363: `"attempt=1 with resume at index 0"` — seeds `spec: BIG`
    (300 bytes), remains correct.

- **Coverage baseline** (CLAUDE.md): line ≥ 95%, branch ≥ 75%, function ≥ 90%.
  Per-file floor: `src/engine/triage.ts` line ≥ 95%. Coverage must not decrease.

## Code References

- `src/engine/run-cycle.ts:29` — `SKIP_ELIGIBLE_STEPS` definition
- `src/engine/run-cycle.ts:31-44` — `shouldSkipForArtifact` (the function to modify)
- `src/engine/run-cycle.ts:39` — the `stat().size > 0` line that returns `skip: true` (needs spec-branch augmentation)
- `src/engine/run-cycle.ts:46` — `export const SPEC_MIN_BYTES = 200`
- `src/engine/run-cycle.ts:52-54` — `formatSpecGuardError` (exported; used in guard, not in skip gate)
- `src/engine/run-cycle.ts:143-154` — retry-skip block in `runCycle`
- `src/engine/run-cycle.ts:20` — `readFile` import (already present)
- `src/engine/run-cycle.ts:195-205` — artifact write + spec post-condition guard seam
- `tests/engine/run-cycle.skip-completed.test.ts:7` — imports `shouldSkipForArtifact`
- `tests/engine/run-cycle.skip-completed.test.ts:82` — `BIG = "x".repeat(300)`
- `tests/engine/run-cycle.skip-completed.test.ts:84-96` — unit test: skip when `> 0` bytes (will break after fix — seed is 2 bytes)
- `tests/engine/run-cycle.skip-completed.test.ts:98-121` — unit test: don't skip zero bytes (unaffected)
- `tests/engine/run-cycle.skip-completed.test.ts:111-120` — unit test: don't skip when missing (unaffected)
- `tests/engine/run-cycle.skip-completed.test.ts:123-134` — unit test: ineligible step (unaffected)
- `tests/engine/run-cycle.spec-guard.test.ts:9` — imports `SPEC_MIN_BYTES` (import pattern to follow)
- `CLAUDE.md` (project root) — "Retry skip policy" architecture note at `## Architecture quick reference` bullet; documents `> 0` bytes — needs update to reflect `>= SPEC_MIN_BYTES` for spec

## Open Questions

1. **Broken test at line 84** (`"skip when artifact exists with > 0 bytes"`): after
   the fix, seeding `"hi"` (2 bytes) will make this test assert the wrong thing.
   The planner must decide whether to update the seed to `BIG` (keeping the
   test's original intent for a non-zero artifact) or to split it into two tests
   (one for `< SPEC_MIN_BYTES` → `skip: false`, one for `≥ SPEC_MIN_BYTES` →
   `skip: true`). The SPEC acceptance criteria imply both branches must be covered.

2. **`research` and `plan` semantics**: the SPEC says they must remain `> 0` bytes
   only. The planner should verify no conditional branch in `shouldSkipForArtifact`
   accidentally changes behavior for those step names.
```
