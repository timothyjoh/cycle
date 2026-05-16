Enough context. Writing the plan now.

# Implementation Plan: Cycle 0096

## Overview
Extend `ingestReflection` in `src/engine/reflection.ts` with a cross-run dedup gate that reads `todo/` and `blocked/` directory listings before the per-entry write loop, suppresses any sharp-edge candidate whose normalized title slug is a substring of a normalized filename in either directory, and emits structured events for suppressed entries and read errors.

## Current State (from Research)
- `ingestReflection` is 127 lines in `src/engine/reflection.ts`; only file to change.
- `readdir` already imported at line 1 — no new imports needed.
- `rawDir` pattern at line 21 establishes how to build sibling `todo/` and `blocked/` paths.
- `usedSlugs` Set (line 70) is the only existing dedup — new gate inserts before this.
- `slugify` in `src/issue/id.ts` caps at 40 chars; SPEC title normalization caps at 60 — must inline, not call `slugify`.
- `IngestResult` type unchanged; `suppressed` count surfaces via log only.
- `reflection.summary` at lines 120–124 gains optional `suppressed_count` field.
- Test file has 24 cases ending at line 589; new tests append after that.
- `setupRepo()` creates `raw/` only; new tests that need `todo/`/`blocked/` must `mkdir` those subdirs.

## Desired End State
- `ingestReflection` reads `todo/` and `blocked/` before the entry loop, builds a `DedupEntry[]` array of `{normalized, relPath}` pairs.
- Per entry: if `normalizeTitle(e.title)` is a substring of any `normalized` filename, emit `reflection.skipped { reason: "dedup", … }` and continue; do not write to `raw/`.
- ENOENT on either dir → treated as empty set, no warning.
- Non-ENOENT `readdir` error → emit `reflection.warning { reason: "dedup_read_error", … }`, treat dir as empty (fail-open).
- `reflection.summary` includes `suppressed_count` when ≥ 1 entry suppressed.
- 7 new test cases cover all acceptance criteria bullets.
- `npm test`, `npm run typecheck`, `npm run test:coverage` all pass.

## What We're NOT Doing
- No dedup against `raw/`, `done/`, or `failed/` directories.
- No fuzzy/semantic matching — substring check only.
- No changes to the existing in-cycle `usedSlugs` dedup or the log.jsonl idempotency path.
- No changes to triage, CLI, queue, or any file other than `reflection.ts`, `reflection.test.ts`, and `CLAUDE.md`.
- No changes to `IngestResult` return type.
- No extraction of shared helpers to `src/issue/id.ts` or elsewhere.

## Implementation Approach
Insert the dedup gate as a pre-loop block between `entries` initialization (line 66) and the `for` loop (line 73). Three new pure helper functions added at the bottom of the module after `atomicWrite`. The `suppressed` counter is local alongside `written`/`skipped`; the conditional `suppressed_count` field is spread into the summary emit. No type exports change.

---

## Task 1: Add Dedup Gate to `src/engine/reflection.ts`

### Overview
Add three helper functions (`normalizeFilename`, `normalizeTitle`, `readDirFailOpen`), build the `DedupEntry[]` array before the entry loop, check each validated entry against it, increment a new `suppressed` counter, update `reflection.summary`.

### Changes Required

**File**: `src/engine/reflection.ts`

**Change A — Add `suppressed` counter alongside `skipped` (line 69 area):**
```typescript
  const written: string[] = [];
  let skipped = 0;
  let suppressed = 0;           // NEW
  const usedSlugs = new Set<string>();
```

**Change B — Build dedup entries before the for loop (after line 66, before line 68):**
```typescript
  const entries = (parsed as { sharp_edges: unknown[] }).sharp_edges;

  // Cross-run dedup: read todo/ and blocked/ before writing any raw/ files.
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  const blockedDir = join(repoRoot, "docs/cycle/issues/blocked");
  type DedupEntry = { normalized: string; relPath: string };
  const todoDedupEntries: DedupEntry[] = (await readDirFailOpen(todoDir, log, cycleId)).map(
    (f) => ({ normalized: normalizeFilename(f), relPath: join("docs/cycle/issues/todo", f) }),
  );
  const blockedDedupEntries: DedupEntry[] = (await readDirFailOpen(blockedDir, log, cycleId)).map(
    (f) => ({ normalized: normalizeFilename(f), relPath: join("docs/cycle/issues/blocked", f) }),
  );
  const dedupEntries = [...todoDedupEntries, ...blockedDedupEntries];

  const written: string[] = [];
  let skipped = 0;
  let suppressed = 0;
```

**Change C — Add dedup check inside the for loop, after `validateEntry`, before slug computation (after line 85 `const e = raw as SharpEdge;`):**
```typescript
    const e = raw as SharpEdge;

    // Cross-run dedup gate (runs before in-cycle usedSlugs check).
    const titleSlug = normalizeTitle(e.title);
    const dedupMatch = dedupEntries.find((d) => d.normalized.includes(titleSlug));
    if (dedupMatch) {
      await log.emit("reflection.skipped", {
        cycle_id: cycleId,
        reason: "dedup",
        title: e.title,
        matched_file: dedupMatch.relPath,
      });
      suppressed++;
      continue;
    }

    let slug = slugify(e.title);
```

**Change D — Update `reflection.summary` emit (lines 120–124):**
```typescript
  await log.emit("reflection.summary", {
    cycle_id: cycleId,
    count: written.length,
    skipped,
    ...(suppressed > 0 ? { suppressed_count: suppressed } : {}),
  });
```

**Change E — Add three helper functions at bottom of module (after `atomicWrite`):**
```typescript
function normalizeFilename(name: string): string {
  return name
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function readDirFailOpen(dir: string, log: Logger, cycleId: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    await log.emit("reflection.warning", {
      cycle_id: cycleId,
      reason: "dedup_read_error",
      dir,
      error: String(e),
    });
    return [];
  }
}
```

### Success Criteria
- [ ] `npm run typecheck` passes with zero errors
- [ ] `normalizeTitle("Engine Has No Stuck Detection")` → `"engine-has-no-stuck-detection"` (manual trace)
- [ ] `normalizeFilename("refl-0085-engine-has-no-stuck-detection.md")` → `"refl-0085-engine-has-no-stuck-detection"` (manual trace)
- [ ] Substring check: `"refl-0085-engine-has-no-stuck-detection".includes("engine-has-no-stuck-detection")` → `true`

---

## Task 2: Add 7 New Test Cases to `tests/engine/reflection.test.ts`

### Overview
Append 7 test cases after line 589. Each test creates a `tmpdir` repo via `setupRepo()`, optionally creates `todo/` and/or `blocked/` subdirs, runs `ingestReflection`, and asserts on both filesystem state and emitted events.

### Changes Required

**File**: `tests/engine/reflection.test.ts` — append after line 589.

**Test 1 — todo/ match suppresses:**
```typescript
test("ingestReflection: dedup suppresses entry whose slug matches todo/ filename", async () => {
  const root = await setupRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/todo", "refl-0085-engine-has-no-stuck-detection.md"),
      "---\nid: refl-0085\n---\nbody\n",
    );
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "Engine Has No Stuck Detection", body: "body text", priority_hint: 5 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(rawFiles.filter((f) => f.startsWith("refl-")).length, 0);
    const skippedEvt = events.find((e) => e.event === "reflection.skipped" && e.fields.reason === "dedup");
    assert.ok(skippedEvt, "reflection.skipped {reason:dedup} must be emitted");
    assert.equal(skippedEvt!.fields.title, "Engine Has No Stuck Detection");
    assert.ok((skippedEvt!.fields.matched_file as string).includes("todo"));
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.ok(summary);
    assert.equal(summary!.fields.count, 0);
    assert.equal(summary!.fields.suppressed_count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 2 — blocked/ match suppresses:**
```typescript
test("ingestReflection: dedup suppresses entry whose slug matches blocked/ filename", async () => {
  const root = await setupRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/blocked", "refl-0042-foo-bar.md"),
      "---\nid: refl-0042-foo-bar\n---\nbody\n",
    );
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "foo bar", body: "body text", priority_hint: 3 }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger);
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(rawFiles.filter((f) => f.startsWith("refl-")).length, 0);
    const skippedEvt = events.find((e) => e.event === "reflection.skipped" && e.fields.reason === "dedup");
    assert.ok(skippedEvt);
    assert.ok((skippedEvt!.fields.matched_file as string).includes("blocked"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 3 — no match → written normally:**
```typescript
test("ingestReflection: dedup pass-through when no filename matches", async () => {
  const root = await setupRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/todo", "refl-0001-unrelated-issue.md"), "---\nid: x\n---\n");
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "completely different problem", body: "body", priority_hint: 4 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    assert.ok(await fileExists(join(root, "docs/cycle/issues/raw", `refl-${CID}-completely-different-problem.md`)));
    assert.ok(!events.find((e) => e.event === "reflection.skipped" && e.fields.reason === "dedup"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 4 — ENOENT on todo/ graceful:**
```typescript
test("ingestReflection: ENOENT on todo/ dir is graceful — no suppression, no warning", async () => {
  const root = await setupRepo();
  try {
    // setupRepo does NOT create todo/ — ENOENT is natural
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "some issue", body: "body", priority_hint: 3 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    assert.ok(!events.find((e) => e.event === "reflection.warning"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 5 — ENOENT on blocked/ graceful:**
```typescript
test("ingestReflection: ENOENT on blocked/ dir is graceful — no suppression, no warning", async () => {
  const root = await setupRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    // blocked/ not created — ENOENT natural
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "some issue", body: "body", priority_hint: 3 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    assert.ok(!events.find((e) => e.event === "reflection.warning"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 6 — both dirs empty → no suppression:**
```typescript
test("ingestReflection: both dirs empty — no suppression, all entries written", async () => {
  const root = await setupRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "alpha", body: "body", priority_hint: 2 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    assert.ok(!events.find((e) => e.event === "reflection.skipped" && e.fields.reason === "dedup"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Test 7 — non-ENOENT error emits warning and fails open:**
```typescript
test("ingestReflection: non-ENOENT readdir error on todo/ emits warning and fails open", async () => {
  const root = await setupRepo();
  try {
    // Write a file at the todo/ path so readdir returns ENOTDIR
    await writeFile(join(root, "docs/cycle/issues/todo"), "not-a-directory");
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "foo", body: "body", priority_hint: 3 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    // Entry still written (fail-open)
    assert.equal(r.written.length, 1);
    const warning = events.find((e) => e.event === "reflection.warning" && e.fields.reason === "dedup_read_error");
    assert.ok(warning, "reflection.warning {reason:dedup_read_error} must be emitted");
    assert.ok((warning!.fields.dir as string).endsWith("todo"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] 7 new tests pass alongside existing 24 (31 total in this file)
- [ ] `npm test` exits 0
- [ ] No existing test regressions

---

## Task 3: Update CLAUDE.md Architecture Note

### Overview
Extend the "Reflection step" bullet in `## Architecture quick reference` to describe the new dedup gate.

### Changes Required

**File**: `CLAUDE.md`

Find the sentence ending with `"On JSON.parse failure the engine first tries…"` paragraph. After the existing `In-pass slug collisions get a numeric suffix...` sentence and before the `On JSON.parse failure` sentence, insert:

> Before the per-entry write loop, `ingestReflection` reads `docs/cycle/issues/todo/` and `docs/cycle/issues/blocked/` and builds a normalized filename set; any `sharp_edges` entry whose normalized title slug (lowercase, non-alphanumeric→`-`, trimmed, capped at 60 chars) is a substring of a normalized filename is suppressed — emitting `reflection.skipped { reason: "dedup", cycle_id, title, matched_file }` — and not written to `raw/`. ENOENT on either directory is treated as empty (no warning). Any other `readdir` error emits `reflection.warning { reason: "dedup_read_error", dir, error }` and skips dedup for that directory only (fail-open). `reflection.summary` gains `suppressed_count` (number) when ≥ 1 entry was suppressed.

### Success Criteria
- [ ] CLAUDE.md "Reflection step" paragraph mentions the dedup gate, `reflection.skipped { reason: "dedup" }`, and fail-open behavior.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Entry whose normalized title slug matches a filename in todo/ is suppressed; no raw/refl-*.md written; reflection.skipped { reason: "dedup", … } emitted.` | Task 1 + Task 2 (Test 1) | |
| `[ ] Entry whose normalized title slug matches a filename in blocked/ is suppressed identically.` | Task 1 + Task 2 (Test 2) | |
| `[ ] Entry with no matching filename in either directory is written to raw/ as normal.` | Task 1 + Task 2 (Test 3) | |
| `[ ] ENOENT on todo/ directory is handled gracefully (treated as empty; no warning emitted; no suppression from that dir).` | Task 1 + Task 2 (Test 4) | |
| `[ ] ENOENT on blocked/ directory is handled gracefully (treated as empty; no warning emitted).` | Task 1 + Task 2 (Test 5) | |
| `[ ] Both directories empty → no suppression; all valid entries written.` | Task 1 + Task 2 (Test 6) | |
| `[ ] Non-ENOENT readdir error on one directory emits reflection.warning { reason: "dedup_read_error", dir, error } and fails open (dedup skipped for that dir only).` | Task 1 + Task 2 (Test 7) | ENOTDIR triggered via file-at-dir-path trick |
| `[ ] reflection.summary.count equals the number of actually-written files; when any suppressed, suppressed_count is present and correct.` | Task 1 + Task 2 (Test 1) | Test 1 asserts `count: 0`, `suppressed_count: 1` |
| `[ ] All existing reflection.test.ts tests remain green.` | Task 2 | Verified by npm test |
| `[ ] npm test passes; npm run typecheck passes; no new compiler warnings.` | All tasks | Final gate |
| `[ ] Coverage does not decrease from master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).` | Task 2 | 7 new tests cover all new branches in Task 1 |

---

## Testing Strategy

### Unit Tests
- 7 new tests in `tests/engine/reflection.test.ts` after line 589.
- All use real filesystem (`mkdtemp`, no mocking).
- ENOTDIR triggered by writing a regular file at the `todo/` path — clean and reliable.
- Each test uses its own `tmpdir` and cleans up in `finally`.

### Integration / E2E Tests
- `npm test` (full suite) is the integration gate — existing 24 tests plus 7 new.
- `npm run test:coverage` validates branch coverage doesn't regress — critical because `readDirFailOpen` has three branches (happy, ENOENT, other) and the dedup check has a true/false branch.

## Risk Assessment
- **`normalizeTitle` caps at 60 vs `slugify` caps at 40**: inlined separately; no collision with existing `slugify` call at line 87 which still generates the raw file id. Risk: none.
- **`DedupEntry` type declared inside function body**: TypeScript allows local type aliases inside async functions; no export needed. Risk: none.
- **ENOTDIR test brittle on some filesystems**: on Darwin (target environment) writing a file then calling `readdir` on it reliably returns ENOTDIR. Risk: low.
- **`join("docs/cycle/issues/todo", f)` path separator**: Darwin uses `/`; consistent with rest of codebase. Risk: none.
- **`reflection.summary` spread conditional**: `...(suppressed > 0 ? { suppressed_count: suppressed } : {})` adds field only when non-zero — existing tests that assert on summary shape won't break because they don't use `assert.deepEqual` on the full summary fields object. Risk: low; verify by running `npm test`.
