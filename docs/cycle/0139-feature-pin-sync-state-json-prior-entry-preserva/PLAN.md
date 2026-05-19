Engine captures stdout — printing PLAN.md content now.

```markdown
# Implementation Plan: Cycle 0139

## Overview

Add one regression-pin test to `tests/defaults/sync-defaults-guard.test.ts` that seeds `.cycle/.sync-state.json` with prior entries, runs the script, and asserts the divergent path's entry survives byte-identical while the non-divergent path's entry is freshly written with valid sha values. No production code changes.

## Current State (from Research)

- `scripts/sync-defaults.mjs` loads state via `loadState()` (line 95), mutates only non-skipped keys in the main loop (lines 100–121), then unconditionally calls `writeStateAtomic(state)` (line 123). Divergent paths hit `continue` and never touch `state[to]`, so any pre-loaded value survives round-trip.
- State entry shape written by script: `{ src_sha256, dst_sha256 }` — no `synced_at`. Extra fields seeded manually survive the skip path untouched.
- `tests/defaults/sync-defaults-guard.test.ts` has 7 existing tests (194 lines). All needed imports already present. Insertion point: after line 174 (`state recording omits skipped paths`), before line 176 (`per-file granularity inside prompts/`).
- Existing `seed()` and `runScript()` helpers cover fixture setup and script invocation. `.cycle/.sync-state.json` written directly via `writeFile` (same pattern as test at line 69).

## Desired End State

`tests/defaults/sync-defaults-guard.test.ts` has an 8th test block titled `"sync-defaults: prior entry for divergent path survives unchanged"` inserted after line 174. `npm test` passes (476 tests). `npm run typecheck` clean. No other files changed.

## What We're NOT Doing

- No changes to `scripts/sync-defaults.mjs` or any production code.
- Not resolving PLAN-vs-impl drift (separate closed issue).
- Not adding coverage instrumentation (separate closed issue).
- Not extracting shared helpers or refactoring the test file structure.
- Not asserting the `synced_at` field on the non-divergent entry (script doesn't write it; that entry is overwritten with `{ src_sha256, dst_sha256 }` only).

## Implementation Approach

Single-task: insert one `test(...)` block at line 175. The test uses:
1. `seed()` to lay down source files and a divergent destination.
2. `writeFile` to pre-seed `.cycle/.sync-state.json` with two entries — one for the divergent path (`workflows.yml`) and one for a non-divergent path (`prompts/spec.md`). Both include `synced_at` to prove extra fields survive.
3. `runScript()` → assert exit code 2.
4. `assert.deepEqual` on the divergent entry (full object including `synced_at` must survive unchanged).
5. `assert.match` + `assert.equal` on the non-divergent entry's sha fields (script overwrites with real computed values).

Divergence is guaranteed because: (a) `.cycle/workflows.yml` content (`"diverged content\n"`) differs from source (`"source: yes\n"`), and (b) the seeded `dst_sha256` (`"cafebabe" + 56 zeros`) does not equal `sha256("diverged content\n")`, so `dstSha !== recorded.dst_sha256` → `isDivergent = true`.

---

## Task 1: Add regression-pin test for prior-entry preservation

### Overview

Insert one test block in `tests/defaults/sync-defaults-guard.test.ts` after the existing `state recording omits skipped paths` test (currently ending at line 174). The test seeds `.cycle/.sync-state.json` before running the script and asserts the divergent path's entry is preserved byte-identical.

### Changes Required

**File**: `tests/defaults/sync-defaults-guard.test.ts`

**Insertion point**: After line 174 (closing `}` of `state recording omits skipped paths` test), before line 176 (`per-file granularity inside prompts/`).

**Code to insert** (exact):

```typescript
test("sync-defaults: prior entry for divergent path survives unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sync-prior-entry-"));
  try {
    await seed(root, {
      "src/defaults/workflows.yml": "source: yes\n",
      "src/defaults/prompts/spec.md": "spec\n",
      ".cycle/workflows.yml": "diverged content\n",
    });
    const seededDivergentEntry = {
      src_sha256: "deadbeef" + "0".repeat(56),
      dst_sha256: "cafebabe" + "0".repeat(56),
      synced_at: "2026-01-01T00:00:00.000Z",
    };
    const seededNonDivergentEntry = {
      src_sha256: "aabbccdd" + "0".repeat(56),
      dst_sha256: "aabbccdd" + "0".repeat(56),
      synced_at: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(
      join(root, ".cycle/.sync-state.json"),
      JSON.stringify(
        {
          ".cycle/workflows.yml": seededDivergentEntry,
          ".cycle/prompts/spec.md": seededNonDivergentEntry,
        },
        null,
        2,
      ) + "\n",
    );
    const result = runScript(root);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    const state = JSON.parse(await readFile(join(root, ".cycle/.sync-state.json"), "utf8"));
    // divergent entry must be byte-identical to what was seeded
    assert.deepEqual(state[".cycle/workflows.yml"], seededDivergentEntry);
    // non-divergent entry overwritten by script with real computed sha values
    assert.match(state[".cycle/prompts/spec.md"].src_sha256, HEX64);
    assert.match(state[".cycle/prompts/spec.md"].dst_sha256, HEX64);
    assert.equal(
      state[".cycle/prompts/spec.md"].src_sha256,
      state[".cycle/prompts/spec.md"].dst_sha256,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**No other file changes required.** All imports (`writeFile`, `readFile`, `join`, `mkdtemp`, `rm`, `tmpdir`) already present at lines 1–6. `HEX64` constant already declared at line 27.

### Success Criteria

- [ ] `npm test` passes (476 tests, 0 failures)
- [ ] New test appears in output as `sync-defaults: prior entry for divergent path survives unchanged ✓`
- [ ] `npm run typecheck` exits 0, no warnings
- [ ] `npm run test:coverage` passes with `scripts/sync-defaults.mjs` ≥ 90% line coverage

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] New test seeds `.cycle/.sync-state.json` with a prior entry for `.cycle/workflows.yml` (divergent path) and a prior entry for a second non-divergent path.` | Task 1 | Seeds both `.cycle/workflows.yml` and `.cycle/prompts/spec.md` entries |
| `[ ] After `runScript`, exit code is `2`.` | Task 1 | `assert.equal(result.status, 2, ...)` |
| `[ ] The divergent path's entry in `.cycle/.sync-state.json` is deep-equal (all fields: `src_sha256`, `dst_sha256`, `synced_at`) to the seeded value — the script did not overwrite or delete it.` | Task 1 | `assert.deepEqual(state[".cycle/workflows.yml"], seededDivergentEntry)` — includes `synced_at` |
| `[ ] The non-divergent path's entry also survives with its seeded values preserved (or is replaced by correct freshly-written values that match the source — either assertion is valid; the key invariant is the divergent entry).` | Task 1 | Asserts fresh real sha values via HEX64 match + `src_sha256 === dst_sha256` |
| `[ ] All existing tests still pass (`npm test`).` | Task 1 | Full suite runs post-insertion |
| `[ ] No compiler/linter warnings introduced (`npm run typecheck`).` | Task 1 | No new imports or type constructs |

---

## Testing Strategy

### Unit Tests

- One new `test(...)` block targeting skip-path prior-entry preservation.
- Real filesystem fixture via `mkdtemp` — no mocking.
- Divergence guaranteed: destination content ≠ source content AND seeded `dst_sha256` ≠ actual sha of destination content.
- `assert.deepEqual` on full divergent entry (including `synced_at`) — catches any field mutation, deletion, or re-serialization side-effect.
- `assert.match(…, HEX64)` + equality on non-divergent entry — confirms script wrote real computed sha.

### Integration / E2E Tests

- `npm test` exercises all 476 tests including the new one end-to-end via `spawnSync` into the actual script.

## Risk Assessment

- **Seeded `dst_sha256` accidentally matching sha of "diverged content\n"**: Extremely unlikely — `"cafebabe" + 56 zeros` is not a valid sha256 of any content. Non-issue.
- **`.cycle/` dir missing before `writeFile` for state file**: Mitigated — `seed()` creates `.cycle/workflows.yml` first, which creates `.cycle/` via `mkdir(dirname(dst), { recursive: true })`.
- **Key format drift**: Keys are posix `to` paths. Consistent with existing assertions at lines 99–102.
```
