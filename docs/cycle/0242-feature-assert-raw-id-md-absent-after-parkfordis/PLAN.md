# Implementation Plan: Cycle 0242

## Overview

Add a `raw/<id>.md` absence assertion after every `parkForDiscussion` call in `tests/engine/triage-priority.test.ts`, closing the adversarial gap where a `copyFile`-without-`unlink` regression passes silently.

## Current State (from Research)

Four tests exercise the `discuss` path via `runTriage`. All four verify that the destination `discuss/<id>.md` exists but none assert that `raw/<id>.md` was removed. `readFile` and `join` are already imported at lines 7 and 12. The ENOENT rejection pattern (`assert.rejects(() => readFile(...), { code: 'ENOENT' })`) is the idiomatic approach consistent with the existing positive-file assertions.

## Desired End State

After this cycle, each of the four discuss-path tests contains an `assert.rejects` call targeting `docs/cycle/issues/raw/<id>.md` immediately following the `parkForDiscussion` operation. A `copyFile`-without-`unlink` substitution causes the assertion to fail. `npm test` passes; `npm run test:coverage && npm run check:coverage` passes; `npm run typecheck` emits no warnings.

## What We're NOT Doing

- No changes to `src/engine/triage.ts` or any other `src/` file
- No new tests beyond the four absence assertions
- No changes to coverage floors or `scripts/coverage-gate.mjs`
- No changes to CLAUDE.md, README.md, or ENGINE.md

## Implementation Approach

Single-file change: insert one `assert.rejects` call per discuss-path test in `tests/engine/triage-priority.test.ts`. Each insertion targets the earliest point after the `parkForDiscussion` side-effect resolves and before any subsequent state mutation (critical for the roundtrip test). The ENOENT pattern mirrors the SPEC's suggested form and is consistent with the existing positive-file assertions already in place.

---

## Task 1: Add Raw-Absence Assertions to All Four Discuss-Path Tests

### Overview

Insert `assert.rejects` / ENOENT checks after each `parkForDiscussion` invocation across all four affected tests.

### Changes Required

**File**: `tests/engine/triage-priority.test.ts`

#### Insertion 1 — "discuss raw: agent never called…" (line 163, `id = "test-discuss-01"`)

After the existing assertion block ending at line 200 (`assert.ok((parked[0].fields.path as string).endsWith(...)`), before the `finally` block at line 202:

```typescript
    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/raw", `${id}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForDiscussion",
    );
```

#### Insertion 2 — "discuss raw moved back to raw/…" (line 244, `id = "test-roundtrip-01"`)

After line 257 (`await readFile(discussPath, "utf8"); // throws if not found`) and **before** line 260 (`await writeFile(rawPath, …)`). `rawPath` is already defined at line 248.

```typescript
    await assert.rejects(
      () => readFile(rawPath, "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after first parkForDiscussion",
    );
```

#### Insertion 3 — "discuss + all normal fail → engine.paused…" (line 281, `discussId = "test-allfail-discuss"`)

After line 322 (`await readFile(discussPath, "utf8");`), before the `finally` block at line 323:

```typescript
    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/raw", `${discussId}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForDiscussion",
    );
```

#### Insertion 4 — "mixed batch: discuss raw parked, normal raw triaged" (line 328, `discussId = "test-mixed-discuss"`)

After line 364 (`await readFile(discussPath, "utf8"); // throws if not found`), before the `readdir` assertion at line 366:

```typescript
    await assert.rejects(
      () => readFile(join(root, "docs/cycle/issues/raw", `${discussId}.md`), "utf8"),
      { code: "ENOENT" },
      "raw file must not exist after parkForDiscussion",
    );
```

### Success Criteria

- [ ] `npm test` passes (all existing tests green, four new ENOENT assertions pass)
- [ ] `npm run typecheck` emits no warnings
- [ ] `npm run test:coverage && npm run check:coverage` passes with `src/engine/triage.ts` ≥ 95%
- [ ] Temporarily replacing `rename` with `copyFile` in `src/engine/triage.ts:717` causes at least one of the four tests to fail; restoring `rename` makes all tests pass again

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Replacing \`rename\` with \`copyFile\` in \`parkForDiscussion\` causes the new assertion to fail` | Task 1 | Verified manually per SPEC §Testing Strategy |
| `[ ] All existing tests continue to pass (\`npm test\`)` | Task 1 | No existing assertions modified |
| `[ ] Coverage floors are met (\`npm run test:coverage && npm run check:coverage\`)` | Task 1 | Test-only change; `triage.ts` floor unaffected |
| `[ ] No compiler warnings from \`npm run typecheck\`` | Task 1 | Only adds `assert.rejects` calls using already-imported identifiers |

---

## Testing Strategy

### Unit Tests

Not applicable — `tests/engine/triage-priority.test.ts` uses real filesystem temp directories; no mocking.

### Integration / E2E Tests

- Each of the four `assert.rejects` calls exercises real filesystem state produced by `parkForDiscussion` via `runTriage`
- Manual regression check (per SPEC): replace `rename` → `copyFile` at `src/engine/triage.ts:717`, run `npm test`, confirm failure in affected tests, restore, confirm green

## Risk Assessment

- **Roundtrip test ordering**: The absence assertion in Test 2 must precede the `writeFile` that re-creates `rawPath` at line 260. Placing it after line 257 and before line 260 is the only safe window. Misplacement (after line 260) would produce a false-positive pass. — Mitigated by explicit line-level placement in the plan.
- **`assert.rejects` error-object matching**: `{ code: 'ENOENT' }` is a subset match against the rejected `Error` object. Node's `fs/promises` `readFile` throws with `code: 'ENOENT'` on missing files — confirmed behavior. No risk of false negative.
- **Coverage floor**: Change is test-only; `src/engine/triage.ts` coverage cannot decrease. No risk.
