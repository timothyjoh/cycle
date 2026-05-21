# Implementation Plan: Cycle 0236

## Overview

Thread `artifactDir` into `CommitCycleOpts` so `commitCycle` reads `touched.json` at the already-known path instead of re-scanning `docs/cycle/` with a `readdir` prefix search. Eliminates the silent-empty-footprint failure mode when `docs/cycle/` does not yet exist.

## Current State (from Research)

- `commitCycle` (lines 126–150 of `src/engine/commit-cycle.ts`) runs a `readdir` scan on `docs/cycle/` to find a directory whose name starts with `${cycleId}-`. If `docs/cycle/` is absent, the catch silences the error and `touchedFiles` stays empty — every staged `src/` file triggers `commit.scope_warning`.
- `cli.ts` does **not** call `runCycle` directly. Both `commitCycle` call sites are preceded by `spawnRunOne`, which runs `run-one.ts` in a child process. No return value crosses the subprocess boundary — only the exit code. Therefore "forward `artifactDir` from `runCycle`'s return" applies to `run-one.ts` only; `cli.ts` must recompute `artifactDir` deterministically.
- The authoritative `artifactDir` formula in `src/engine/branch.ts` is `join(repoRoot, "docs", "cycle", `${cycleId}-${workflow}-${slugify(title)}`)`. All three inputs are available at both `cli.ts` call sites. `slugify` is exported from `src/issue/id.ts` and not yet imported by `cli.ts`.
- The existing "in-footprint: no commit.scope_warning emitted" test (line 502) creates `docs/cycle/0099-feature-test/` and relies on the scan to find `touched.json`. With the scan removed and no `artifactDir` passed, `touchedFiles` stays empty and the test breaks. This test must be updated to pass `artifactDir`.

## Desired End State

- `src/engine/commit-cycle.ts`: `readdir` import and scan block removed; `artifactDir?: string` in opts; `touched.json` read via `join(opts.artifactDir, "touched.json")` when `artifactDir` is present.
- `src/engine/run-cycle.ts`: both `"ok"` and `"failed"` return shapes include `artifactDir: string`.
- `src/cli.ts`: both `commitCycle` call sites compute and pass `artifactDir` using the canonical formula.
- `tests/engine/commit-cycle.test.ts`: existing in-footprint test updated to pass `artifactDir`; new regression test confirms no `commit.scope_warning` when `artifactDir` is supplied, `docs/cycle/` is absent, and nothing is staged.
- `docs/ENGINE.md`: known-limitation note at line 169 retired; commit-lifecycle description updated.
- `npm run typecheck` zero errors; `npm run test:coverage` passes; `src/engine/commit-cycle.ts` line coverage ≥ 95%.

## What We're NOT Doing

- Not changing `touched.json` accumulation logic in `run-cycle.ts` (only return type change).
- Not modifying `parseTouchedFiles`, `stageFiles`, or any other commit helper.
- Not extracting a named `CommitCycleOpts` type alias — the inline type is sufficient.
- Not writing a sidecar file for IPC between `run-one.ts` and `cli.ts`.
- Not extending `RESET_ELIGIBLE_STEPS` (separate known limitation, out of scope).

## Implementation Approach

The subprocess boundary means `cli.ts` cannot read `runCycle`'s return value. The minimal-change approach is deterministic recomputation of `artifactDir` in `cli.ts` using the same `join(cwd, "docs", "cycle", `${cycleId}-${workflowName}-${slugify(title)}`)` formula used in `branch.ts`. This requires one new import (`slugify`) and two lines of computation. `runCycle`'s return type is still extended (as SPEC requires) so `run-one.ts` has the value available without re-computing, even though it does not use it in this cycle.

---

## Task 1: Remove `readdir` scan from `commitCycle`; add `artifactDir` to opts

### Overview

Add `artifactDir?: string` to `commitCycle`'s inline opts type. Replace the `readdir` scan block with a direct `readFile` call guarded by `opts.artifactDir`. Remove `readdir` from the import. When `artifactDir` is absent, `touchedFiles` stays `new Set()` (same silent-skip semantics as today's catch-fallback).

### Changes Required

**File**: `src/engine/commit-cycle.ts`

**Line 3 — remove `readdir` from import:**
```typescript
// Before:
import { readFile, readdir } from "node:fs/promises";
// After:
import { readFile } from "node:fs/promises";
```

**Lines 128–136 — add `artifactDir?: string` to inline opts type:**
```typescript
opts: {
  cycleId: string;
  title: string;
  issueId?: string;
  config: CommitConfig;
  baseBranch: string;
  envExtra?: Record<string, string>;
  log?: Logger;
  artifactDir?: string;
},
```

**Lines 141–150 — replace directory-scan block:**
```typescript
// Before (remove entirely):
try {
  const entries = await readdir(join(repoRoot, "docs/cycle"));
  const match = entries.find((e) => e.startsWith(`${opts.cycleId}-`));
  if (match) {
    const raw = await readFile(join(repoRoot, "docs/cycle", match, "touched.json"), "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) touchedFiles = new Set(parsed.files as string[]);
  }
} catch { /* docs/cycle absent, touched.json absent, or corrupt */ }

// After:
if (opts.artifactDir) {
  try {
    const raw = await readFile(join(opts.artifactDir, "touched.json"), "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) touchedFiles = new Set(parsed.files as string[]);
  } catch { /* touched.json absent or corrupt */ }
}
```

### Success Criteria

- [ ] `readdir` does not appear anywhere in `src/engine/commit-cycle.ts`
- [ ] `CommitCycleOpts` inline type contains `artifactDir?: string`
- [ ] `npm run typecheck` zero errors
- [ ] `npm test` passes (existing tests unmodified except Task 3 fix)

---

## Task 2: Surface `artifactDir` from `runCycle` return type

### Overview

Add `artifactDir: string` to both `"ok"` and `"failed"` return shapes in `runCycle`. The variable is already in scope at both return sites (assigned at lines 208–229). No logic change required.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Line 419 — `"failed"` return shape:**
```typescript
// Before:
return { cycleId, status: "failed" as const, failingStep: step.name };
// After:
return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
```

**Line 424 — `"ok"` return shape:**
```typescript
// Before:
return { cycleId, status: "ok" as const };
// After:
return { cycleId, artifactDir, status: "ok" as const };
```

### Success Criteria

- [ ] `runCycle` return type inferred by TypeScript includes `artifactDir: string` in both shapes
- [ ] `src/cli/run-one.ts` compiles without error (uses `result.status` only; new field is extra, not breaking)
- [ ] `npm run typecheck` zero errors

---

## Task 3: Thread `artifactDir` into both `commitCycle` call sites in `src/cli.ts`

### Overview

Add `slugify` import to `cli.ts`. At each `commitCycle` call site, compute `artifactDir` using the canonical formula and pass it as a field. No other changes to the call sites.

### Changes Required

**File**: `src/cli.ts`

**Add import** (alongside existing imports at top of file):
```typescript
import { slugify } from "./issue/id.ts";
```

**Resume-path call site (lines 372–379):** compute `artifactDir` before the call:
```typescript
const artifactDir = join(cwd, "docs", "cycle", `${tail.cycleId}-${workflowName}-${slugify(tail.title)}`);
const cr = await commitCycle(cwd, {
  cycleId: tail.cycleId,
  title: tail.title,
  issueId: tail.issueId,
  config: cfg.engine.commit,
  baseBranch: cfg.engine.base_branch,
  log,
  artifactDir,
});
```

**Fresh-cycle call site (lines 474–481):** compute `artifactDir` before the call:
```typescript
const artifactDir = join(cwd, "docs", "cycle", `${cycleId}-${workflowName}-${slugify(row.title)}`);
const cr = await commitCycle(cwd, {
  cycleId,
  title: row.title,
  issueId: row.id,
  config: cfg!.engine.commit,
  baseBranch: cfg!.engine.base_branch,
  log,
  artifactDir,
});
```

### Success Criteria

- [ ] `slugify` imported from `"./issue/id.ts"` in `src/cli.ts`
- [ ] Both `commitCycle` invocations pass `artifactDir`
- [ ] `npm run typecheck` zero errors
- [ ] `npm test` passes

---

## Task 4: Update existing in-footprint test; add regression test

### Overview

The "in-footprint: no commit.scope_warning emitted" test (line 502) creates `docs/cycle/0099-feature-test/touched.json` and relies on the scan to find it. With the scan removed, it must pass `artifactDir` to preserve its intent. The other two scope_warning tests (out-of-footprint and no-touched.json) do not rely on the scan — they still pass with an absent `artifactDir` because `touchedFiles` stays empty and warnings fire correctly.

Add a new regression test asserting no spurious `commit.scope_warning` when `artifactDir` is supplied but `docs/cycle/` does not exist and nothing is staged.

### Changes Required

**File**: `tests/engine/commit-cycle.test.ts`

**Update existing test at line 517** — add `artifactDir` to the `commitCycle` call:
```typescript
await commitCycle(root, {
  cycleId: "0099",
  title: "in footprint",
  config: { mode: "trunk", push: false },
  baseBranch: "master",
  log,
  artifactDir: join(root, "docs/cycle/0099-feature-test"),
});
```

**Add new test** after line 564:
```typescript
test("commitCycle — artifactDir supplied, docs/cycle absent: no commit.scope_warning, result skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-sw-nodir-"));
  try {
    await setupRepo(root);
    // Provide a real artifactDir (no touched.json inside) but no docs/cycle/ dir at all
    const artifactDir = join(root, "artifact-dir");
    await mkdir(artifactDir, { recursive: true });
    // Stage nothing — result should be "skipped"
    const log = await createLogger(root, () => {});
    const result = await commitCycle(root, {
      cycleId: "0099",
      title: "no docs cycle dir",
      config: { mode: "trunk", push: false },
      baseBranch: "master",
      log,
      artifactDir,
    });
    assert.equal(result.status, "skipped");
    let events: Record<string, unknown>[] = [];
    try {
      const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      events = body.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch { /* no log written */ }
    const warnings = events.filter((e) => e.event === "commit.scope_warning");
    assert.equal(warnings.length, 0, "no commit.scope_warning when nothing staged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] "in-footprint: no commit.scope_warning emitted" test passes with updated `artifactDir` field
- [ ] New regression test passes
- [ ] All 16 existing `commit-cycle.test.ts` test blocks pass
- [ ] `npm run test:coverage` passes; `src/engine/commit-cycle.ts` line coverage ≥ 95%

---

## Task 5: Update `docs/ENGINE.md`

### Overview

Retire the known-limitation note at line 169 (the `readdir` prefix-scan limitation). Update the commit-lifecycle description at line 159 to reference `CommitCycleOpts.artifactDir` rather than a directory scan.

### Changes Required

**File**: `docs/ENGINE.md`

**Line 159** — update description:
```
// Before:
At commit time, `commitCycle` reads `touched.json` from the cycle's artifact dir (falling back to an empty set if the file is absent or unparseable)...

// After (same content, no change to this sentence needed — it already describes the desired behavior)
```

**Line 169** — remove the known-limitation paragraph:
```
// Remove entirely:
**Known limitation:** `commitCycle` independently re-discovers the cycle artifact directory via a `readdir` prefix scan on `docs/cycle/` rather than receiving the path from `run-cycle.ts` directly. If `docs/cycle/` is absent or the scan finds no matching entry, `commitCycle` silently falls back to an empty footprint set, causing `commit.scope_warning` for every staged `src/` file. Fix: thread `artifactDir` (or a `touchedJsonPath`) into `CommitCycleOpts` so the path is resolved once by `runCycle` and passed through.
```

Update line 159 to reference the opts field explicitly:
```
At commit time, `commitCycle` reads `touched.json` from `opts.artifactDir` (falling back to an empty set if `artifactDir` is absent, the file is absent, or the file is unparseable)...
```

### Success Criteria

- [ ] Known-limitation paragraph about `readdir` prefix scan absent from `docs/ENGINE.md`
- [ ] Commit-lifecycle description references `CommitCycleOpts.artifactDir`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] CommitCycleOpts in src/engine/commit-cycle.ts declares an artifactDir?: string field` | Task 1 | Added to existing inline opts type |
| `[ ] The readdir call and the entries.find(e => e.startsWith(...)) block are absent from commit-cycle.ts` | Task 1 | Entire scan block removed; import updated |
| `[ ] runCycle return type exposes artifactDir: string in both "ok" and "failed" return shapes` | Task 2 | Both return sites in `run-cycle.ts` extended |
| `[ ] Both commitCycle invocations in src/cli.ts pass artifactDir from the runCycle result` | Task 3 | Deterministic recomputation in `cli.ts`; direct forwarding from `runCycle` result is architecturally unavailable due to subprocess boundary — recomputation uses the identical canonical formula from `branch.ts` |
| `[ ] New regression test in tests/engine/commit-cycle.test.ts passes: a commit run with artifactDir pointing at a directory where docs/cycle/ does not exist emits no commit.scope_warning event` | Task 4 | New test constructs temp dir without `docs/cycle/`, passes valid `artifactDir`, asserts no warning and result is `"skipped"` |
| `[ ] All existing commit-cycle.test.ts tests pass` | Task 4 | The "in-footprint" test requires a one-line `artifactDir` addition to remain semantically correct; all other existing tests unmodified |
| `[ ] npm run test:coverage passes with src/engine/commit-cycle.ts line coverage ≥ 95%` | Task 4 | New test adds coverage to the `if (opts.artifactDir)` branch |
| `[ ] npm run typecheck reports zero errors` | Tasks 1–3 | All type changes are additive; `run-one.ts` not affected |

---

## Testing Strategy

### Unit Tests

- The new `if (opts.artifactDir)` branch has two sub-paths: `touched.json` present and parseable (covered by updated "in-footprint" test), and `touched.json` absent or corrupt (covered by new regression test and existing "no touched.json" test with `artifactDir` absent). Both paths hit before and after the guard.
- No mocking of `node:fs/promises` — all tests use `mkdtemp` + real filesystem per CLAUDE.md convention.
- `expectExactlyOne` from `tests/helpers.ts` used for any `commit.scope_warning` cardinality assertion.

### Integration / E2E Tests

- The `cli.ts` threading change is exercised by the full engine test suite via the existing cycle-lifecycle tests. No new integration test is added — the subprocess boundary means `commitCycle` with `artifactDir` is fully tested at the unit level.

## Risk Assessment

- **Existing "in-footprint" test breaks without update**: mitigated by Task 4's explicit update to add `artifactDir`; the change is one field addition, not a logic rewrite.
- **`slugify` produces a different slug than `branch.ts` used at creation time**: `slugify` is deterministic given the same title string; both sites use the title from the queue row, same value that was passed to `runCycle` originally. Zero divergence risk.
- **`artifactDir` path mismatch between `cli.ts` computation and actual directory name**: only possible if the title is mutated between queue write and `commitCycle` call — queue rows are immutable after triage. No risk.
- **TypeScript fails to infer `artifactDir` in `runCycle` return**: `artifactDir` is assigned in all branches of the `if (opts.resume)` block before the step loop; TypeScript control-flow analysis will see it as definitely assigned at both return sites. No risk.
