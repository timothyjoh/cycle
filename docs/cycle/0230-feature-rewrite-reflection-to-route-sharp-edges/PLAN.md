# Implementation Plan: Cycle 0230

## Overview

Rewrite `src/engine/reflection.ts` and its prompt to implement three-bucket routing for sharp edges: `fix_now` items go to `FINAL_FIXES.md` for in-cycle remediation, `defer` items become prioritized `raw/` issues, and `discuss` items become `raw/` issues with `priority: discuss`. Enforces a 2-issue deferred cap per cycle, deduplicates against `raw/`/`todo/`/`discuss/`, integrates `commit.scope_warning` events, writes `REFLECTION.md`, and eliminates all `priority_hint` numeric fields.

## Current State (from Research)

- `ingestReflection` has 5 params (no `artifactDir`, no `touchedJsonPath`); writes all sharp edges to `raw/` unconditionally
- `SharpEdge` type uses `priority_hint: number`; `validateEntry` requires a finite number for that field
- `writeParseError` hardcodes `priority_hint: 7`
- Reflection prompt elicits `{ sharp_edges: [{ title, body, priority_hint }] }` with a 1–10 numeric scale
- `commit.scope_warning` events exist only in `.cycle/log.jsonl` (no sidecar file)
- `Priority` enum (`"low" | "medium" | "high" | "critical" | "discuss"`) already exists in `queue.ts:6`
- `atomicWrite` helper in `reflection.ts` is private and reusable
- `serializeFrontmatter` / `parseFrontmatter` in `frontmatter.ts` handle the round-trip
- `src/engine/reflection.ts` has no per-file coverage floor registered in `coverage-gate.mjs`
- 26 tests in `tests/engine/reflection.test.ts`; all reference `priority_hint`

## Desired End State

After this cycle:
- `ingestReflection(repoRoot, cycleId, slug, stdout, log, artifactDir, touchedJsonPath)` — 7-param signature
- `SharpEdge.bucket: "fix_now" | "defer" | "discuss"` replaces `priority_hint: number`
- `fix_now` items → `FINAL_FIXES.md` in `artifactDir` (activates `final_fix` step gate)
- `defer`/`discuss` items → `raw/` issues with `priority` enum, capped at 2 combined, deduplicated
- `commit.scope_warning` events from `.cycle/log.jsonl` converted to deferred cleanup issues
- `REFLECTION.md` written to `artifactDir` on every successful parse
- No `priority_hint` field in any written file or log event
- Log events: `reflection.fix_now_written`, `reflection.deferred_issue_written`, `reflection.dedup_skipped`, `reflection.cap_reached`
- `src/engine/reflection.ts` registered at 95% line coverage floor

**Verify**: `npm test` passes; `npm run test:coverage && npm run check:coverage` passes; `src/engine/reflection.ts` line coverage ≥ 95%; `FINAL_FIXES.md` appears when fix_now items present; absent when none; at most 2 raw issues written per run; `reflection.cap_reached` emitted when cap hit.

## What We're NOT Doing

- No changes to `commit-cycle.ts` (scope_warning read by scanning `log.jsonl`, not via sidecar)
- No changes to `triage.ts`, `queue.ts`, or any other workflow step
- No changes to the `Priority` type definition (already `"low" | "medium" | "high" | "critical" | "discuss"`)
- No `dryRunTriage` discuss-routing mirror (separate deferred issue)
- No `final_verify` double-run cost reduction (separate deferred issue from cycle 0229)
- No structural invariants changes (routing logic doesn't require new build-time assertions)

## Implementation Approach

All changes are confined to `src/engine/reflection.ts`, `src/defaults/prompts/reflection.md`, `scripts/coverage-gate.mjs`, `src/engine/run-cycle.ts` (one call site), `tests/engine/reflection.test.ts`, and `docs/ENGINE.md`. Work proceeds in three phases: (1) update types/validation/prompt so the JSON contract is correct; (2) implement routing logic in `ingestReflection`; (3) wire the call site and register the coverage floor.

Resolution of open questions from RESEARCH:

- **`commit.scope_warning` access**: Scan `.cycle/log.jsonl` line-by-line for `event === "commit.scope_warning"` with matching `cycle_id`. No `commit-cycle.ts` changes needed.
- **`REFLECTION.md` on parse error**: NOT written. SPEC says "on every successful reflection"; parse-error path is not successful.
- **Idempotent cleanup scope**: Cleanup stays limited to `raw/` only. Dedup logic prevents re-writing to `todo/`/`discuss/`.
- **Cap count**: 2 (defer + discuss combined), per SPEC acceptance criteria.
- **`priority_hint` in `writeParseError`**: Replace `priority_hint: 7` with `priority: "high"`.
- **`validateEntry` for new buckets**: `bucket` must be one of `"fix_now" | "defer" | "discuss"`; `priority` required (valid enum string) for `"defer"` bucket only; `fix_now` and `discuss` need no `priority` field.

---

## Task 1: Update `SharpEdge` type, `validateEntry`, and `writeParseError`

### Overview

Replace `priority_hint: number` with `bucket` + optional `priority` throughout the foundational types and validation path. This is a prerequisite for all subsequent routing logic.

### Changes Required

**File**: `src/engine/reflection.ts`

**`SharpEdge` type** (line 8): replace
```ts
export type SharpEdge = { title: string; body: string; priority_hint: number };
```
with:
```ts
export type SharpEdge = {
  title: string;
  body: string;
  bucket: "fix_now" | "defer" | "discuss";
  priority?: string;
};
```

**`IngestResult` type** (line 9): extend to expose new counters:
```ts
export type IngestResult = {
  written: string[];    // IDs of raw issues written to raw/
  skipped: number;      // entries failing validation
  fixNow: number;       // fix_now items appended to FINAL_FIXES.md
};
```

**`validateEntry`** (lines 225–231): replace `priority_hint` check with bucket routing validation:
```ts
const VALID_BUCKETS = new Set(["fix_now", "defer", "discuss"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function validateEntry(e: Partial<SharpEdge> | null | undefined): string | null {
  if (!e || typeof e !== "object") return "entry";
  if (typeof e.title !== "string" || e.title.trim() === "") return "title";
  if (typeof e.body !== "string" || e.body.trim() === "") return "body";
  if (typeof e.bucket !== "string" || !VALID_BUCKETS.has(e.bucket)) return "bucket";
  if (e.bucket === "defer") {
    if (typeof e.priority !== "string" || !VALID_PRIORITIES.has(e.priority)) return "priority";
  }
  return null;
}
```

**`writeParseError`** (lines 206–223): replace `priority_hint: 7` with `priority: "high"`:
```ts
// in serializeFrontmatter call:
priority: "high",   // was: priority_hint: 7
```

### Success Criteria
- [ ] `tsc --noEmit` passes with no errors
- [ ] `validateEntry` rejects entries missing `bucket`, missing `priority` on `defer`, or with invalid enum values
- [ ] `validateEntry` accepts `fix_now` and `discuss` entries without `priority`
- [ ] No `priority_hint` field remains in `reflection.ts`

---

## Task 2: Implement Three-Bucket Routing in `ingestReflection`

### Overview

Add `artifactDir` and `touchedJsonPath` params; implement `readScopeWarnings` helper; implement dedup helper; route `fix_now` to `FINAL_FIXES.md`, `defer`/`discuss` to `raw/` with cap + dedup; write `REFLECTION.md`; emit new log events.

### Changes Required

**File**: `src/engine/reflection.ts`

**New imports** at top: add `readFile` to the existing `node:fs/promises` import, add `createInterface` from `node:readline`.

**New `ingestReflection` signature**:
```ts
export async function ingestReflection(
  repoRoot: string,
  cycleId: string,
  _cycleSlug: string,
  stdout: string,
  log: Logger,
  artifactDir: string,
  touchedJsonPath: string,
): Promise<IngestResult>
```

**`readScopeWarnings` helper** (new private function):
```ts
async function readScopeWarnings(logPath: string, cycleId: string): Promise<string[][]> {
  // Read log.jsonl line by line; collect files[] from all commit.scope_warning
  // events matching cycleId. Returns array of file arrays (one per warning event).
  // Returns [] if log file absent or unreadable.
  try {
    const text = await readFile(logPath, "utf8");
    const results: string[][] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as { event?: string; cycle_id?: string; files?: string[] };
        if (ev.event === "commit.scope_warning" && ev.cycle_id === cycleId && Array.isArray(ev.files)) {
          results.push(ev.files);
        }
      } catch { /* skip malformed lines */ }
    }
    return results;
  } catch { return []; }
}
```

**`buildDedupeSet` helper** (new private function):
```ts
async function buildDedupeSet(
  rawDir: string, todoDir: string, discussDir: string
): Promise<Set<string>> {
  // Collect all .md filenames (without .md suffix) from the three dirs.
  // Returns a Set of id strings for O(1) lookup.
  const set = new Set<string>();
  for (const dir of [rawDir, todoDir, discussDir]) {
    try {
      for (const name of await readdir(dir)) {
        if (name.endsWith(".md")) set.add(name.slice(0, -3));
      }
    } catch { /* dir absent — ok */ }
  }
  return set;
}
```

**`buildFinalFixesContent` helper** (new private function):
```ts
function buildFinalFixesContent(cycleId: string, fixes: SharpEdge[], touchedFiles: string[]): string {
  const header = touchedFiles.length > 0
    ? `> Footprint: ${touchedFiles.join(", ")}`
    : `> Footprint: unknown — touched.json absent`;
  const items = fixes.map((f, i) =>
    `## Fix ${i + 1}: ${f.title}\n\n${f.body}`
  ).join("\n\n---\n\n");
  return `# Final Fixes — Cycle ${cycleId}\n\n${header}\n\n${items}\n`;
}
```

**`buildReflectionContent` helper** (new private function):
```ts
function buildReflectionContent(
  cycleId: string,
  edges: SharpEdge[],
  routing: { fixNow: number; deferred: number; dedupSkipped: number; capDropped: number; validationSkipped: number }
): string { /* markdown with sharp edge list and routing summary table */ }
```

**`ingestReflection` body** — replace the main write loop with:

1. Keep existing idempotent cleanup (lines 25–35 unchanged — only clears `raw/`).
2. Attempt `parseWithRepair` (unchanged).
3. Read `touchedJsonPath` to get `touchedFiles: string[]` (try/catch; default `[]` if absent).
4. Scan `.cycle/log.jsonl` for `commit.scope_warning` events matching `cycleId` via `readScopeWarnings`.
5. Convert scope warnings to synthetic `SharpEdge` entries with `bucket: "defer"`, `priority: "low"`, title derived from the files list.
6. Build dedup set via `buildDedupeSet(rawDir, todoDir, discussDir)` — call AFTER cleanup so raw/ is fresh.
7. Process entries with routing:
   - `fix_now`: validate, collect; no cap check; emit `reflection.fix_now_written`
   - `defer`/`discuss`: validate, check dedup (emit `reflection.dedup_skipped` if hit), check cap (emit `reflection.cap_reached` if hit), write raw issue with `priority` frontmatter (use `"discuss"` for discuss bucket), emit `reflection.deferred_issue_written`
8. If any `fix_now` items: write `FINAL_FIXES.md` via `atomicWrite`.
9. Write `REFLECTION.md` via `atomicWrite`.
10. Emit `reflection.summary` (unchanged event name, updated fields).
11. Return `{ written, skipped, fixNow }`.

**Raw issue frontmatter shape** for new routing (replacing `priority_hint`):
```ts
serializeFrontmatter({
  id,
  source: "reflection",
  title: e.title,
  added_at: nowIso,
  triage_attempts: 0,
  priority: e.bucket === "discuss" ? "discuss" : (e.priority ?? "medium"),
  origin_cycle_id: cycleId,
}, "\n" + e.body + "\n")
```

**Log events emitted**:
- `reflection.fix_now_written` — `{ cycle_id, title, index }`
- `reflection.deferred_issue_written` — `{ cycle_id, raw_id, title, bucket, priority }`
- `reflection.dedup_skipped` — `{ cycle_id, id, existing_in }` (which dir contained the dup)
- `reflection.cap_reached` — `{ cycle_id, title, bucket, dropped_count }`
- `reflection.summary` — keep existing name; update fields: `{ cycle_id, count, skipped, fix_now, cap_dropped, dedup_skipped }`

Replace `reflection.surfaced` with `reflection.deferred_issue_written` for routed defer/discuss items. (Tests checking `reflection.surfaced` must be updated to `reflection.deferred_issue_written`.)

### Success Criteria
- [ ] `tsc --noEmit` passes
- [ ] `fix_now` entries produce `FINAL_FIXES.md` in `artifactDir`; absent when no `fix_now` entries
- [ ] `REFLECTION.md` written to `artifactDir` after successful parse
- [ ] `REFLECTION.md` NOT written on parse error
- [ ] At most 2 raw issues written across defer+discuss combined
- [ ] `reflection.cap_reached` emitted for each entry dropped past cap=2
- [ ] Dedup correctly skips issues already in `raw/`, `todo/`, or `discuss/`
- [ ] `reflection.dedup_skipped` emitted with correct `existing_in` dir
- [ ] `commit.scope_warning` events become deferred cleanup raw issues
- [ ] No `priority_hint` in any written file or emitted event

---

## Task 3: Update `run-cycle.ts` Call Site

### Overview

Pass `artifactDir` and `join(artifactDir, "touched.json")` to the updated `ingestReflection`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Lines 382–384** — update the call:
```ts
if (r.status === "ok" && step.name === "reflection") {
  await ingestReflection(
    repoRoot, cycleId, slug, r.stdout, log,
    artifactDir,
    join(artifactDir, "touched.json"),
  );
}
```

`artifactDir` is already in scope (lines 208–229). `join` is already imported.

### Success Criteria
- [ ] `tsc --noEmit` passes (the 7-param call matches the updated signature)
- [ ] `npm test` passes (existing run-cycle tests still pass)

---

## Task 4: Register `reflection.ts` Coverage Floor

### Overview

Add the per-file floor that the SPEC requires. Without this, the coverage gate won't enforce the 95% minimum even if `npm run test:coverage` is run.

### Changes Required

**File**: `scripts/coverage-gate.mjs`

Add to the `FLOORS` object (after `"src/engine/run-cycle.ts": 90,`):
```js
"src/engine/reflection.ts": 95,
```

### Success Criteria
- [ ] `npm run check:coverage` enforces ≥ 95% line coverage for `src/engine/reflection.ts`
- [ ] The gate fails if coverage drops below the floor

---

## Task 5: Update and Extend `reflection.test.ts`

### Overview

Update all 26 existing tests to use the new 7-param signature and `bucket`/`priority` fields. Extend `setupRepo` to create `todo/` and `discuss/` dirs. Add new tests covering three-bucket routing, cap, dedup, scope_warning, and REFLECTION.md/FINAL_FIXES.md presence.

### Changes Required

**File**: `tests/engine/reflection.test.ts`

**`setupRepo` update** — change return type from `Promise<string>` to `Promise<{ root: string; artifactDir: string }>`:
```ts
async function setupRepo(): Promise<{ root: string; artifactDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/discuss"), { recursive: true });
  const artifactDir = join(root, `docs/cycle/${CID}-test-cycle`);
  await mkdir(artifactDir, { recursive: true });
  // Create empty log.jsonl so readScopeWarnings has something to read
  await writeFile(join(root, ".cycle", "log.jsonl"), "", "utf8");
  return { root, artifactDir };
}
```

**All existing 26 tests** — mechanical updates:
1. Destructure `setupRepo()` result: `const { root, artifactDir } = await setupRepo()`
2. Add `artifactDir` and `join(artifactDir, "touched.json")` as the 6th and 7th args to every `ingestReflection` call
3. Replace `priority_hint: <number>` in test input JSON with `bucket: "defer", priority: "medium"` (or appropriate bucket)
4. Update the `priority_hint` field assertion in the happy-path test (line 67): assert `fm.priority === "medium"` and no `fm.priority_hint`
5. Update `reflection.surfaced` event assertions to `reflection.deferred_issue_written`
6. Update the "non-number priority_hint is dropped" test (line 383) to test invalid `bucket` value instead: `{ title: "bad", body: "b", bucket: "invalid" }` → `skip.fields.field === "bucket"`
7. Update the "out-of-range priority_hint" test (line 465) to test `bucket: "defer", priority: "medium"` and assert `fm.priority === "medium"` and no `fm.priority_hint`
8. Update the `parseError` test (line 103) to assert `fm.priority === "high"` (not `fm.priority_hint === 7`)
9. Update the idempotent re-run test (line 444) — input JSON now uses `bucket`/`priority`
10. Update the slug-collision test (line 402) — input JSON uses `bucket`/`priority`

**New tests** (add after existing tests):

```
test("fix_now: FINAL_FIXES.md written with title and body")
test("fix_now: FINAL_FIXES.md absent when no fix_now entries")
test("fix_now: multiple fix_now items all appear in FINAL_FIXES.md")
test("cap: at most 2 defer+discuss combined written; reflection.cap_reached emitted for excess")
test("cap: discuss counts toward cap")
test("dedup: matching id in raw/ emits reflection.dedup_skipped, no duplicate written")
test("dedup: matching id in todo/ emits reflection.dedup_skipped")
test("dedup: matching id in discuss/ emits reflection.dedup_skipped")
test("scope_warning: commit.scope_warning in log.jsonl produces deferred raw issue")
test("scope_warning: scope_warning subject to cap and dedup")
test("REFLECTION.md: present in artifactDir after successful reflection")
test("REFLECTION.md: absent after parse error (not written on failure)")
test("priority: defer entry with priority: critical writes priority: critical frontmatter")
test("priority: discuss entry writes priority: discuss frontmatter")
test("no priority_hint: no written file contains priority_hint key in frontmatter")
```

**`expectExactlyOne` usage**: use it for `reflection.summary` in all tests that check it (already done); use it for new exactly-once events `reflection.cap_reached` (when testing cap hit exactly once) per the cardinality-pinning convention in CLAUDE.md.

### Success Criteria
- [ ] All 26 migrated existing tests pass with updated `bucket`/`priority` inputs
- [ ] All 15 new tests pass
- [ ] `reflection.ts` line coverage ≥ 95% per `npm run check:coverage`
- [ ] `npm test` passes with zero failures (total test count ≥ 679 + new reflection tests)

---

## Task 6: Rewrite Reflection Prompt and Sync

### Overview

Replace the `priority_hint` 1–10 numeric schema with `bucket` + `priority` fields and bright-line routing criteria. Sync to `.cycle/`.

### Changes Required

**File**: `src/defaults/prompts/reflection.md`

Replace the output contract section and field rules. Key changes:

- **New output contract**:
```json
{
  "sharp_edges": [
    {
      "title": "<one-line title, <= 80 chars, kebab-friendly>",
      "body":  "<1-3 short paragraphs>",
      "bucket": "fix_now | defer | discuss",
      "priority": "critical | high | medium | low"
    }
  ]
}
```
`priority` only required when `bucket` is `"defer"`. Omit for `fix_now` and `discuss`.

- **Bright-line routing criteria** (new section):

| Bucket | Use when | `priority` field |
|--------|----------|-----------------|
| `fix_now` | Mechanical correction in a file already touched this cycle; no design decision required; can be applied without reading any diff context | omit |
| `defer` | Work for a future cycle; no design ambiguity; assign `critical/high/medium/low` | required |
| `discuss` | Involves architectural trade-offs, competing valid approaches, or policy questions needing human input | omit |

- Remove the "priority_hint 1–4" filter rule; replace with: "Only surface issues you would route to `fix_now`, `defer` (medium or higher), or `discuss`. Skip trivial style nits and observations with no concrete cost."

- Keep all other sections (inputs to read, what counts as a sharp edge, discipline/bad output examples) with minor wording updates to match new schema.

**Sync**:
```
npm run sync-defaults
```

### Success Criteria
- [ ] `src/defaults/prompts/reflection.md` contains `bucket` field, no `priority_hint`
- [ ] `.cycle/prompts/reflection.md` byte-identical to `src/defaults/prompts/reflection.md` after sync
- [ ] `npm run check:invariants` passes (byte-identity invariant)

---

## Task 7: Update ENGINE.md

### Overview

Update the `reflection` section to describe three-bucket routing, FINAL_FIXES.md output, REFLECTION.md output, cap/dedup behavior, and new log events. Remove the known-limitation note about `priority_hint`.

### Changes Required

**File**: `docs/ENGINE.md`

In the reflection section:
- Replace description of `priority_hint` emission with description of `bucket` routing
- Add: `fix_now` items → `FINAL_FIXES.md` in artifact dir (activates `final_fix` step via `skip_unless` gate)
- Add: `defer`/`discuss` cap of 2 per cycle; `reflection.cap_reached` event when dropped
- Add: dedup scan against `raw/`, `todo/`, `discuss/`; `reflection.dedup_skipped` event
- Add: `commit.scope_warning` events from `.cycle/log.jsonl` converted to deferred cleanup issues
- Add: `REFLECTION.md` written to artifact dir on every successful reflection
- Add: new log event table: `reflection.fix_now_written`, `reflection.deferred_issue_written`, `reflection.dedup_skipped`, `reflection.cap_reached`
- Remove: any known-limitation note about `priority_hint` being numeric

### Success Criteria
- [ ] ENGINE.md reflection section accurately describes the new routing behavior
- [ ] No mention of `priority_hint` remains in the reflection section

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running the reflection step on a cycle with a touched.json footprint causes FINAL_FIXES.md to appear in the artifact dir when fix-now items exist, and to be absent when there are none.` | Task 2, Task 5 | `FINAL_FIXES.md` written by `ingestReflection` when `fixNow > 0`; tested in Task 5 |
| `[ ] At most 2 raw issues (defer + discuss combined) are written to docs/cycle/issues/raw/ per reflection run; a reflection.cap_reached event is emitted when additional edges are dropped.` | Task 2, Task 5 | Cap enforced in routing loop; `expectExactlyOne` used for cap event in tests |
| `[ ] A second reflection run with identical content for an issue already in raw/, todo/, or discuss/ emits reflection.dedup_skipped and does not write a duplicate file.` | Task 2, Task 5 | `buildDedupeSet` called after cleanup; three dedup tests cover each dir |
| `[ ] commit.scope_warning entries are converted to deferred raw issues (subject to cap and dedup).` | Task 2, Task 5 | `readScopeWarnings` scans `.cycle/log.jsonl`; synthetic entries injected into routing loop |
| `[ ] No priority_hint field appears in any file written by ingestReflection or emitted in any log event from reflection.ts.` | Task 1, Task 2, Task 5 | `priority_hint` removed from `SharpEdge`, `validateEntry`, `writeParseError`, all frontmatter writes, all log events; "no priority_hint" test asserts this |
| `[ ] REFLECTION.md is present in the artifact dir after a successful reflection step.` | Task 2, Task 5 | `atomicWrite` to `join(artifactDir, "REFLECTION.md")`; REFLECTION.md test asserts presence |
| `[ ] tests/engine/reflection.test.ts covers: fix_now routing to FINAL_FIXES.md, cap enforcement at 2, dedup against raw/ + todo/ + discuss/, scope_warning integration, and absence of priority_hint in output.` | Task 5 | 15 new tests cover all enumerated scenarios |
| `[ ] npm test passes with zero failures.` | Tasks 1–7 | Verified at end of each task |
| `[ ] npm run test:coverage + npm run check:coverage pass; src/engine/reflection.ts line coverage ≥ 95%.` | Task 4, Task 5 | Coverage floor registered in Task 4; new tests bring coverage above floor |
| `[ ] npm run check:invariants passes.` | Task 6 | `sync-defaults` keeps byte-identity invariant satisfied |
| `[ ] npm run typecheck produces no errors.` | Tasks 1–3 | All type changes must satisfy `tsc --noEmit` |
| `[ ] All existing tests still pass.` | Tasks 1–5 | Existing 26 tests mechanically updated; no behavior changes to passing scenarios |

---

## Testing Strategy

### Unit Tests

All tests go in `tests/engine/reflection.test.ts`. Use Node built-in `node:test` with `node:assert/strict`.

**Migrated tests (26 total)**: update input JSON from `priority_hint: N` to `bucket: "defer", priority: "medium"` (or appropriate bucket); update event field checks from `priority_hint` to `priority`/`bucket`; update `reflection.surfaced` to `reflection.deferred_issue_written`; update `setupRepo()` destructuring; add `artifactDir` and `touchedJsonPath` args.

**New tests (≥15)**:
- `fix_now` → `FINAL_FIXES.md`: assert file contains title and body; assert `reflection.fix_now_written` emitted
- `fix_now` absent → `FINAL_FIXES.md` absent: verify via `fileExists`
- Cap at 2: supply 3 defer entries; assert only 2 raw files written; assert `reflection.cap_reached` emitted once (via `expectExactlyOne`)
- Discuss counts toward cap: supply 1 defer + 1 discuss + 1 more defer; assert cap at 2 total
- Dedup raw/: pre-create `refl-${CID}-foo.md` in `raw/`; assert `reflection.dedup_skipped` emitted; no second file written
- Dedup todo/: pre-create `refl-${CID}-foo.md` in `todo/`; same assertion
- Dedup discuss/: pre-create `refl-${CID}-foo.md` in `discuss/`; same assertion
- scope_warning: write a `commit.scope_warning` event to `log.jsonl`; assert a deferred raw issue is written
- scope_warning + cap: write scope_warning entry when cap already full; assert `reflection.cap_reached`
- `REFLECTION.md` present: assert `fileExists(join(artifactDir, "REFLECTION.md"))` after success
- `REFLECTION.md` absent on parse error: assert `!fileExists(...)` after unparseable stdout
- `priority` enum in frontmatter: assert `fm.priority === "critical"` for defer+critical entry
- `discuss` priority: assert `fm.priority === "discuss"` for discuss entry
- No `priority_hint`: read all written `.md` files; assert none contain `priority_hint` in content

**Mocking strategy**: use `makeLogger()` (inline, existing pattern). No database mocks. All file I/O uses real `tmpdir` trees (existing pattern). `readScopeWarnings` tested via real `log.jsonl` files written in temp tree.

### Integration / E2E Tests

Not required: `run-cycle.ts` integration tests already cover the reflection step call site (Task 3 only changes argument passing). The `ingestReflection` unit tests provide sufficient coverage for the new routing logic.

## Risk Assessment

- **Breaking call-site type mismatch**: `ingestReflection` gains 2 required params. Only one call site (`run-cycle.ts:383`). TypeScript will catch if call site is missed. Mitigation: `tsc --noEmit` in Task 3 success criteria.
- **Dedup false negative on re-run**: cleanup removes `refl-<cycleId>-*` from `raw/`, then dedup set is built on the cleaned state. Files moved to `todo/`/`discuss/` by triage between runs are correctly caught. Mitigation: dedup test pre-populates `todo/` before calling `ingestReflection`.
- **`readScopeWarnings` log scan cost**: `.cycle/log.jsonl` grows unboundedly. Scan is O(n) in log size. Acceptable for now; the log is append-only JSONL and reads are sequential. Mitigation: no mitigation needed at current scale.
- **`FINAL_FIXES.md` overwrite on re-run**: each `ingestReflection` call overwrites `FINAL_FIXES.md` via `atomicWrite`. If the `final_fix` step already ran and produced `FINAL_FIX.md`, a subsequent re-reflection would clobber `FINAL_FIXES.md`. Mitigation: acceptable; re-running reflection is an explicit engine action and expected to regenerate outputs.
- **Coverage gate failure**: adding the 95% floor before tests achieve it fails the gate. Mitigation: register floor in Task 4 (after implementing tests in Task 5 would be wrong order). Actually, Task 4 must be ordered AFTER Task 5 to avoid a failing gate on intermediate commits. **Reorder**: do Task 4 last among code tasks, just before ENGINE.md.
