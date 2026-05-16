I have all the context needed. Outputting the plan now.

# Implementation Plan: Cycle 0090

## Overview
Extend `shouldSkipForArtifact` in `src/engine/run-cycle.ts` to re-validate the `spec` artifact against `SPEC_MIN_BYTES` (200) before deciding to skip, so a below-threshold `SPEC.md` from a prior failed attempt is treated as absent and the spec step re-runs.

## Current State (from Research)

- `shouldSkipForArtifact` (lines 31–44) uses `stat().size > 0` for all three skip-eligible steps. No byte-floor re-check for `spec`.
- `SPEC_MIN_BYTES = 200` is already exported (line 46). `readFile` is already imported (line 20).
- Existing test at line 84 seeds `"hi"` (2 bytes) and asserts `skip: true` — **this test breaks after the fix** and must be updated to seed `BIG` (300 bytes).
- Integration tests at lines 164–229 all seed `spec: BIG` (300 bytes ≥ 200) — unaffected.
- `research` and `plan` skip semantics (`> 0` bytes only) must remain unchanged.

## Desired End State

- `shouldSkipForArtifact("spec", ...)` returns `{ skip: false }` when `SPEC.md` has `< 200` UTF-8 bytes (even if `size > 0`).
- `shouldSkipForArtifact("spec", ...)` returns `{ skip: true }` when `SPEC.md` has `≥ 200` UTF-8 bytes.
- `shouldSkipForArtifact("research" | "plan", ...)` behavior unchanged: skip at `> 0` bytes regardless of byte count.
- `npm test` passes. Coverage does not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- CLAUDE.md "Retry skip policy" note updated to document the stricter spec gate.

## What We're NOT Doing

- Deleting or renaming below-threshold `SPEC.md` artifacts (overwrite on re-run is sufficient).
- Applying byte-floor to `research` or `plan` (no post-condition floor exists for them).
- Any queue schema changes.
- Adding E2E integration test for this branch (unit tests of `shouldSkipForArtifact` are sufficient; the fix is pure async logic with no LLM calls).

## Implementation Approach

Add a `spec`-branch inside the existing `try` block in `shouldSkipForArtifact`. After `stat()` confirms `size > 0`, if `stepName === "spec"`, read the file and check `Buffer.byteLength(content, "utf8") < SPEC_MIN_BYTES` — return `{ skip: false }` if below threshold, otherwise fall through to the existing `return { skip: true, artifactPath }`. The `readFile` call inherits the existing catch block, so any read error naturally falls through to `{ skip: false }`. No new imports needed.

---

## Task 1: Extend `shouldSkipForArtifact` with spec byte-floor check

### Overview
Add the `spec`-specific byte-floor branch inside `shouldSkipForArtifact`. Uses `readFile` (already imported) and `SPEC_MIN_BYTES` (already exported). Single catch block covers both `stat` and `readFile` errors.

### Changes Required

**File**: `src/engine/run-cycle.ts`  
**Lines**: 37–42 (inside `shouldSkipForArtifact`)

Replace:
```typescript
  try {
    const st = await stat(artifactPath);
    if (st.isFile() && st.size > 0) return { skip: true, artifactPath };
  } catch {
    // ENOENT or unreadable — fall through
  }
```

With:
```typescript
  try {
    const st = await stat(artifactPath);
    if (st.isFile() && st.size > 0) {
      if (stepName === "spec") {
        const content = await readFile(artifactPath, "utf8");
        if (Buffer.byteLength(content, "utf8") < SPEC_MIN_BYTES) return { skip: false };
      }
      return { skip: true, artifactPath };
    }
  } catch {
    // ENOENT or unreadable — fall through
  }
```

### Success Criteria
- [ ] `shouldSkipForArtifact("spec", dir)` returns `{ skip: false }` for 199-byte file
- [ ] `shouldSkipForArtifact("spec", dir)` returns `{ skip: true }` for 200-byte file
- [ ] `shouldSkipForArtifact("research", dir)` still returns `{ skip: true }` for 1-byte file
- [ ] `shouldSkipForArtifact("plan", dir)` still returns `{ skip: true }` for 1-byte file
- [ ] `npm run typecheck` passes

---

## Task 2: Fix breaking unit test and add regression tests

### Overview
The test at line 84 seeds `"hi"` (2 bytes) and asserts `skip: true` — after Task 1 this becomes `skip: false`, breaking it. Update to seed `BIG`. Add three new unit tests covering: below-threshold, exact boundary (200 bytes), and a regression guard that `research`/`plan` still skip at 1 byte.

### Changes Required

**File**: `tests/engine/run-cycle.skip-completed.test.ts`

**Change 1** — Update line 89 seed from `"hi"` to `BIG` in the existing `"skip when artifact exists with > 0 bytes"` test:
```typescript
// was: await writeFile(join(dir, "SPEC.md"), "hi", "utf8");
await writeFile(join(dir, "SPEC.md"), BIG, "utf8");  // BIG = 300 bytes ≥ SPEC_MIN_BYTES
```

**Change 2** — Add three new tests after line 134 (after the `"ineligible step never skips"` test):

```typescript
test("shouldSkipForArtifact: spec below SPEC_MIN_BYTES (199 bytes) → no skip", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPEC.md"), "x".repeat(199), "utf8");
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shouldSkipForArtifact: spec at exactly SPEC_MIN_BYTES (200 bytes) → skip", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPEC.md"), "x".repeat(200), "utf8");
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, true);
    if (r.skip) assert.equal(r.artifactPath, join(dir, "SPEC.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shouldSkipForArtifact: research and plan skip at 1 byte (unchanged semantics)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "RESEARCH.md"), "x", "utf8");
    await writeFile(join(dir, "PLAN.md"), "x", "utf8");
    const rr = await shouldSkipForArtifact(dir, "research");
    assert.equal(rr.skip, true);
    const rp = await shouldSkipForArtifact(dir, "plan");
    assert.equal(rp.skip, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Updated test at line 84 still passes (now seeds `BIG`, still asserts `skip: true`)
- [ ] New below-threshold test passes: 199 bytes → `skip: false`
- [ ] New boundary test passes: 200 bytes → `skip: true`
- [ ] New regression test passes: `research`/`plan` skip at 1 byte
- [ ] `npm test` passes with all existing tests intact

---

## Task 3: Update CLAUDE.md retry skip policy note

### Overview
The architecture note in CLAUDE.md describes the skip policy as `> 0` bytes. After this fix, `spec` requires `>= SPEC_MIN_BYTES`. Update the note so it accurately reflects the stricter gate.

### Changes Required

**File**: `CLAUDE.md`  
**Section**: `## Architecture quick reference` → "Retry skip policy (pre-build only)" bullet

Find the sentence:
> The gate self-suppresses on resume entry (governed by `startStepIndex`), is bypassed for bash agents, and uses strict `> 0` bytes (zero-byte artifact does not skip).

Update to:
> The gate self-suppresses on resume entry (governed by `startStepIndex`), is bypassed for bash agents, and uses strict `> 0` bytes (zero-byte artifact does not skip). For `spec` specifically, an additional byte-floor check requires `Buffer.byteLength(content, "utf8") >= SPEC_MIN_BYTES` (200); a below-threshold `SPEC.md` is treated as absent even if non-empty on disk.

### Success Criteria
- [ ] CLAUDE.md "Retry skip policy" note accurately describes the stricter `spec` gate
- [ ] No other sections require update (README.md: no user-visible change per SPEC)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] shouldSkipForArtifact("spec")` returns `{ skip: false }` when `SPEC.md` exists but contains fewer than 200 bytes | Task 1 + Task 2 | Implemented in source; exercised by new 199-byte unit test |
| `[ ] shouldSkipForArtifact("spec")` returns `{ skip: true }` when `SPEC.md` exists and contains 200 or more bytes | Task 1 + Task 2 | Implemented in source; exercised by updated line-84 test (300 bytes) and new 200-byte boundary test |
| `[ ] shouldSkipForArtifact("research")` and `shouldSkipForArtifact("plan")` behavior is unchanged (skip when `> 0` bytes) | Task 1 + Task 2 | `spec`-branch is gated on `stepName === "spec"`; new regression test verifies research/plan at 1 byte |
| `[ ] A regression test in tests/engine/ exercises the below-threshold branch and asserts no step.skipped event for spec` | Task 2 | New 199-byte unit test covers this directly |
| `[ ] npm test passes with no coverage regressions (line ≥ 95%, branch ≥ 75%, function ≥ 90%)` | Task 1 + Task 2 | Verified after test suite runs |
| `[ ] All existing tests still pass` | Task 2 | Updated line-84 test preserves passing status; all other existing tests unaffected |

---

## Testing Strategy

### Unit Tests
- `shouldSkipForArtifact` is a pure async function with no LLM calls — unit tests are the right layer.
- Update line 84 seed to `BIG` (preserves skip-when-large intent).
- Add 199-byte test (below-threshold → `skip: false`).
- Add 200-byte test (boundary → `skip: true`).
- Add 1-byte `research`/`plan` regression guard (confirms no behavior change for non-spec steps).
- Zero-byte and missing-file tests (lines 98–121) are unaffected — no change needed.

### Integration / E2E Tests
No new integration tests needed. Existing integration tests at lines 164–229 already seed `spec: BIG` (300 bytes ≥ 200) and cover the skip-all-three and skip-spec-only paths. The fix does not change behavior for those seeds.

## Risk Assessment
- **Broken test at line 84**: Resolved by updating seed to `BIG` in Task 2. Failure mode is immediate and obvious — test fails loudly.
- **readFile race (stat succeeds, file deleted before readFile)**: Falls through the existing catch to `{ skip: false }` — step re-runs, which is the safe behavior. No additional guard needed.
- **research/plan regression**: Gated strictly on `stepName === "spec"` — no code path touches research/plan behavior. New regression test makes any future regression immediately visible.
- **Coverage**: Three new tests add branches directly in `shouldSkipForArtifact`. Coverage should increase, not decrease.
