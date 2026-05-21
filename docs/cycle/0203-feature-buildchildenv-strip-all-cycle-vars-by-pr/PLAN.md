Full context gathered. Writing the plan now.

```markdown
# Implementation Plan: Cycle 0203

## Overview

Replace the per-name `CYCLE_TRUNK_BASED` destructure in `buildChildEnv` with a
prefix-based filter that strips every `CYCLE_*` var, making contamination
prevention self-enforcing for all future engine vars.

## Current State (from Research)

- `src/engine/child-env.ts:31` strips only `CYCLE_TRUNK_BASED` via destructure.
- `src/engine/run-cycle.ts:207–213` explicitly re-injects needed vars (`CYCLE_ID`,
  `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID`) via `cycleEnv` passed as `extra`.
- `tests/engine/child-env.test.ts` has 4 tests; none assert `CYCLE_*` stripping.
- `scripts/coverage-gate.mjs` FLOORS has no entry for `src/engine/child-env.ts`.
- Peer small-utility modules (`path-utils.ts`, `engine-lock.ts`) have 100% floors.

## Desired End State

- `buildChildEnv` filters by `!k.startsWith('CYCLE_')` — one change, two lines.
- Two new tests cover: (a) all `CYCLE_*` absent, (b) explicit `cycleEnv` entries present.
- `scripts/coverage-gate.mjs` FLOORS gains `"src/engine/child-env.ts": 100`.
- `npm run typecheck`, `npm test`, and `npm run check:coverage` all pass.

## What We're NOT Doing

- No changes to `run-cycle.ts`, `exec-bash.ts`, or any caller of `buildChildEnv`.
- No changes to how `CYCLE_TRUNK_BASED` is set in `cli.ts` or read in `workflow.ts`.
- No new `CYCLE_*` vars introduced.
- No refactoring of unrelated test infrastructure.

## Implementation Approach

Single-pass replacement: swap lines 31–32 of `child-env.ts` for a
`Object.fromEntries(Object.entries(process.env).filter(...))` form. This is
type-safe without any cast: `Object.entries(process.env)` returns
`[string, string | undefined][]`, `fromEntries` produces
`{ [k: string]: string | undefined }`, compatible with `NodeJS.ProcessEnv`.
Spread structure (`{ ...stripped, ...extra, PATH: path }`) stays the same.
Open questions resolved:

1. **Type cast**: no cast needed — `fromEntries` return type is compatible with
   `NodeJS.ProcessEnv` as-is.
2. **Coverage floor**: add `"src/engine/child-env.ts": 100` to FLOORS, consistent
   with `path-utils.ts` and `engine-lock.ts` peer pattern.

---

## Task 1: Replace per-name destructure with prefix filter

### Overview

Swap the hardcoded `CYCLE_TRUNK_BASED` destructure for a prefix-based filter.
One functional change in `buildChildEnv`; no callers change.

### Changes Required

**File**: `src/engine/child-env.ts`

Replace lines 28–32:
```ts
  // Strip cycle-engine-internal vars so they don't bleed into arbitrary
  // subprocesses (bash steps, agents, verify scripts). They are re-injected
  // explicitly via cycleEnv when needed (e.g. CYCLE_BASE, CYCLE_ID).
  // CYCLE_TRUNK_BASED in particular causes test-suite contamination when
  // npm test is run as a bash step and inherits the engine's env.
  const { CYCLE_TRUNK_BASED: _t, ...baseEnv } = process.env as Record<string, string | undefined>;
  return { ...baseEnv, ...extra, PATH: path };
```

With:
```ts
  // Strip all CYCLE_* vars by prefix so no engine-internal var bleeds into
  // subprocesses. Vars that subprocesses legitimately need are re-injected
  // explicitly via cycleEnv (e.g. CYCLE_BASE, CYCLE_ID, CYCLE_TITLE).
  const stripped = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("CYCLE_"))
  );
  return { ...stripped, ...extra, PATH: path };
```

### Success Criteria

- [ ] `npm run typecheck` passes with no errors
- [ ] Existing 4 tests still pass (no regressions)
- [ ] `CYCLE_TRUNK_BASED` no longer appears in the striplist by name

---

## Task 2: Add unit tests + coverage floor

### Overview

Two new unit tests cover the stripping invariant and the explicit-injection
exemption. A new 100% floor entry enforces coverage going forward.

### Changes Required

**File**: `tests/engine/child-env.test.ts`

Add after the existing 4 tests, following the save/restore pattern:

```ts
test("buildChildEnv strips all CYCLE_* vars from process.env", () => {
  const saved = {
    CYCLE_TRUNK_BASED: process.env.CYCLE_TRUNK_BASED,
    CYCLE_ID: process.env.CYCLE_ID,
    CYCLE_TITLE: process.env.CYCLE_TITLE,
  };
  try {
    process.env.CYCLE_TRUNK_BASED = "1";
    process.env.CYCLE_ID = "0042";
    process.env.CYCLE_TITLE = "test-title";
    const env = buildChildEnv({});
    assert.equal(env.CYCLE_TRUNK_BASED, undefined);
    assert.equal(env.CYCLE_ID, undefined);
    assert.equal(env.CYCLE_TITLE, undefined);
  } finally {
    if (saved.CYCLE_TRUNK_BASED === undefined) delete process.env.CYCLE_TRUNK_BASED;
    else process.env.CYCLE_TRUNK_BASED = saved.CYCLE_TRUNK_BASED;
    if (saved.CYCLE_ID === undefined) delete process.env.CYCLE_ID;
    else process.env.CYCLE_ID = saved.CYCLE_ID;
    if (saved.CYCLE_TITLE === undefined) delete process.env.CYCLE_TITLE;
    else process.env.CYCLE_TITLE = saved.CYCLE_TITLE;
  }
});

test("buildChildEnv preserves explicitly-injected CYCLE_* entries from extra", () => {
  const saved = { CYCLE_ID: process.env.CYCLE_ID };
  try {
    process.env.CYCLE_ID = "from-env";
    const env = buildChildEnv({ CYCLE_ID: "from-extra" });
    assert.equal(env.CYCLE_ID, "from-extra");
  } finally {
    if (saved.CYCLE_ID === undefined) delete process.env.CYCLE_ID;
    else process.env.CYCLE_ID = saved.CYCLE_ID;
  }
});
```

**File**: `scripts/coverage-gate.mjs`

Add to FLOORS table (after `engine-lock.ts` entry, line 24):
```js
  "src/engine/child-env.ts": 100,
```

### Success Criteria

- [ ] `npm run test:coverage` passes with 6 tests in `child-env.test.ts`
- [ ] `npm run check:coverage` passes with new 100% floor for `child-env.ts`
- [ ] Both new tests fail if the old per-name destructure is restored (verify the tests are meaningful)

---

## SPEC Acceptance Traceability

The issue file is the authoritative acceptance source (SPEC.md contained only a
summary sentence). Acceptance criteria verbatim from
`docs/cycle/issues/todo/refl-0202-buildchildenv-strips-cycle-trunk-based-b.md`:

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `buildChildEnv` strips every `CYCLE_*`-prefixed var from the base environment, not just `CYCLE_TRUNK_BASED` | Task 1 | prefix filter replaces per-name destructure |
| Explicitly injected `cycleEnv` entries still appear in the resulting child env | Task 2 | second new test covers this |
| No test regressions; coverage floor for `child-env.ts` maintained | Task 2 | new floor entry at 100% + 6 passing tests |
| `npm run typecheck` passes | Task 1 | no cast needed; types are compatible |

---

## Testing Strategy

### Unit Tests

- Two new tests in `tests/engine/child-env.test.ts` using `node:test` + `node:assert/strict`.
- Follow existing save/restore pattern for `process.env` mutation.
- Test (a): set three `CYCLE_*` vars in `process.env`, call `buildChildEnv({})`, assert all three are `undefined` in result.
- Test (b): set `CYCLE_ID` in `process.env`, call `buildChildEnv({ CYCLE_ID: "from-extra" })`, assert result is `"from-extra"` (extra wins over stripped env).
- No mocking needed — tests operate directly on `process.env` and the real function.

### Integration / E2E Tests

No integration tests needed. The existing `execBashStep` test (test 4) already
exercises the subprocess env path end-to-end. If that test still passes after
Task 1, the wiring is correct.

## Risk Assessment

- **`Object.entries` undefined values**: `process.env` values can be `undefined`
  in the type system. `Object.entries` on `NodeJS.ProcessEnv` does include
  entries with `undefined` values; `fromEntries` round-trips them. The spread
  `{ ...stripped, ...extra, PATH: path }` is unchanged in behavior. Mitigation:
  existing tests that check for specific env keys (PATH, CUSTOM_KEY) will catch
  any regression.
- **New coverage floor too strict**: `child-env.ts` is 33 lines; at 100% floor,
  any uncovered branch will block CI. Mitigation: all three branches (`extra.PATH`
  present, absent; `basePath` truthy, falsy) are already covered by existing
  tests — verified by the file's current high coverage in `test:coverage` runs.
```
