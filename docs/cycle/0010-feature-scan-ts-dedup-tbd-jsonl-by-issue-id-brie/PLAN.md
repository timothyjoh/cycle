```markdown
# Implementation Plan: Cycle 0010

## Overview
Add deduplication-by-id to `scanTbd` so re-staging an issue file whose id already lives in `.cycle/tbd.jsonl` does not write a duplicate JSONL row. File-rename `tbd/ → queued/` still occurs; the dedup gate protects only the `appendFile` call and the returned `TbdEntry[]`.

## Current State (from Research)
- `scanTbd` (`src/engine/scan.ts:17-49`) unconditionally appends one JSONL row per `tbd/*.md` and pushes the entry into the returned array.
- Single call site `src/cli.ts:48` consumes every returned entry as a cycle to run.
- Test infra: Node native `node:test` + `node:assert/strict`, per-test `mkdtemp` tmpdirs, no fs mocks; one happy-path test exists at `tests/engine/scan.test.ts:8-30`.
- File I/O uses `node:fs/promises` named imports (already in `scan.ts:1`).
- Frontmatter parser already follows a "tolerate non-matching, skip silently" stance — same posture applies to malformed JSONL lines.
- Coverage gate: line ≥ 95% / branch ≥ 75% / func ≥ 90%.

## Desired End State
- `scanTbd` reads `.cycle/tbd.jsonl` (if present) on entry, builds `Set<string>` of known ids tolerating malformed lines, and guards both the `appendFile` and the `ingested.push` on `!knownIds.has(id)`. Newly-appended ids are added to the same Set to dedup intra-scan duplicates.
- Caller at `src/cli.ts:48` continues to drive a cycle per returned entry; duplicates are silently absorbed (file moved, no new cycle scheduled, no new JSONL row).
- `tests/engine/scan.test.ts` covers: cold start (existing), dup-from-prior-jsonl, two-scan dup, intra-scan dup, malformed-line tolerance.
- `npm test`, `npm run typecheck`, `npm run test:coverage` all green; coverage non-regressing.

## What We're NOT Doing
- No reordering / priority of `tbd.jsonl` (RFC-001 priority queue scope).
- No drain-on-completion mutation of `tbd.jsonl` from `runCycle`.
- No migration / rewrite of historical duplicate rows already on disk.
- No changes to `TbdEntry` shape or `scanTbd` signature.
- No new public exports, no new modules, no new dependencies.
- No `triage.attempts` / `status` schema work.
- No special handling for `tbd.jsonl` permission errors (only ENOENT is silenced; other read errors propagate).

## Implementation Approach
One small, local change to `src/engine/scan.ts`: introduce a private `readKnownIds` helper, call it once at the top of `scanTbd`, gate the existing `appendFile` + `ingested.push` behind a `Set.has(id)` check, and `Set.add(id)` after successful append. Returned array **excludes** skipped entries (decision below). Tests live in the existing `tests/engine/scan.test.ts`, mirroring its tmpdir fixture pattern.

### Resolved Open Question — Return-Array Policy
**Decision: exclude skipped (duplicate-id) entries from the returned array.**
Rationale: `src/cli.ts:48` runs one cycle per returned entry. If an id is already in `tbd.jsonl`, the queue already owns it — re-emitting it would schedule a duplicate cycle on the same issue (double-write of branches, commits, PRs). The whole purpose of dedup is to make `tbd.jsonl` the canonical source of truth, so a returned entry must mean "newly admitted to the queue this scan". The `tbd/ → queued/` rename still happens for the re-staged file, matching BRIEF's "move first … then append (dedup by id)" contract.

### Resolved Open Question — Pre-existing duplicate rows on disk
SPEC §Out of Scope confirms no migration. `readKnownIds` only builds a Set; it does not rewrite `tbd.jsonl`. Pre-existing dups collapse harmlessly into one Set entry.

### Resolved Open Question — Read failure modes
ENOENT (cold start) → empty Set, no throw. Any other error from `readFile` propagates (consistent with current code's posture that unexpected fs errors crash the scan). Malformed lines inside an existing file → tolerate-and-skip (per SPEC acceptance criterion).

---

## Task 1: Add `readKnownIds` helper + dedup gate in `scanTbd`

### Overview
Read existing `.cycle/tbd.jsonl` into a `Set<string>` of ids, then guard `appendFile` + `ingested.push` on `!knownIds.has(id)`. Add freshly-appended ids back into the Set so two `tbd/*.md` files with the same id within a single scan also collapse to one row.

### Changes Required
**File**: `src/engine/scan.ts`
**Changes**:

Add a private helper above `scanTbd`:

```ts
async function readKnownIds(jsonlPath: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let raw: string;
  try {
    raw = await readFile(jsonlPath, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return ids;
    throw e;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.id === "string") ids.add(obj.id);
    } catch {
      // tolerate malformed line
    }
  }
  return ids;
}
```

Modify `scanTbd` (`src/engine/scan.ts:17-49`):

- Compute `jsonlPath = join(cycleDir, "tbd.jsonl")` once.
- After `mkdir(cycleDir, …)`, call `const knownIds = await readKnownIds(jsonlPath);`.
- Replace the unconditional `appendFile` + `ingested.push` with:
  ```ts
  await rename(src, dst);
  const entry: TbdEntry = { id: fm.id, source: fm.source, title: fm.title, path: dst, added_at: fm.added_at };
  if (!knownIds.has(entry.id)) {
    await appendFile(jsonlPath, JSON.stringify(entry) + "\n", "utf8");
    knownIds.add(entry.id);
    ingested.push(entry);
  }
  ```
- Keep `rename` outside the `if` so re-staged files always move to `queued/`.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` green (all prior tests pass).
- [ ] Manual: drop two `tbd/X.md` files with same id `X`, run scan in a tmpdir REPL → `tbd.jsonl` contains exactly one row; both files removed from `tbd/`; `queued/` ends with one `X.md` (second `rename` overwrites the first, fine).

---

## Task 2: Test coverage for dedup, intra-scan dup, malformed jsonl, cold-start

### Overview
Extend `tests/engine/scan.test.ts` with four new tests covering all SPEC acceptance criteria. Mirror the existing tmpdir + `try/finally` pattern; no mocks.

### Changes Required
**File**: `tests/engine/scan.test.ts`
**Changes**: Add four `test(...)` blocks alongside the existing one.

1. **`skips appendFile when id already in tbd.jsonl`**
   - Seed `.cycle/tbd.jsonl` with one row `{"id":"X", …}`.
   - Drop `tbd/X.md` with matching frontmatter id `X`.
   - `await scanTbd(root)` → assert returned array is `[]` (excluded), `queued/` contains `X.md`, `tbd/` is empty, `tbd.jsonl` contains exactly one line matching `"id":"X"` (verify via `raw.split("\n").filter(Boolean).length === 1`).

2. **`two-scan dup collapses to one row`**
   - Cold start. Drop `tbd/X.md`, `scanTbd` → row appended.
   - Drop a fresh `tbd/X.md` with same id again, `scanTbd` → assert `tbd.jsonl` still has exactly one matching row; second scan returns `[]`.

3. **`intra-scan dup collapses to one row`**
   - Drop two files in `tbd/` (`X-a.md`, `X-b.md`) with the same frontmatter id `X` but different filenames.
   - `scanTbd` once → assert exactly one row for `X` in `tbd.jsonl`; returned array length 1; both files removed from `tbd/`.
   - Note: file rename for the second file will overwrite the first in `queued/` (same `id`-derived filename only if they share names — using different filenames here keeps both moved). Document with one inline comment if not obvious.

4. **`tolerates malformed lines in existing tbd.jsonl`**
   - Seed `.cycle/tbd.jsonl` with: `"not json\n"` + `'{"id":"OLD"}\n'` + `"\n"` + `'{"no_id":true}\n'`.
   - Drop `tbd/NEW.md` with id `NEW`.
   - `scanTbd` → does not throw; returned array `[{id:"NEW",…}]`; `tbd.jsonl` final content includes the original four lines plus the new `NEW` row; re-running scan with another fresh `tbd/NEW.md` collapses (no duplicate row).

5. **(regression-guard, optional)** Confirm cold-start (no `.cycle/tbd.jsonl` file at all) by adding a second cold-start variation — existing happy-path test already exercises this; skip unless coverage report shows a gap.

### Success Criteria
- [ ] All four new tests pass under `npm test`.
- [ ] `npm run test:coverage` shows line ≥ 95%, branch ≥ 75%, func ≥ 90% with **no regression vs master baseline** for `src/engine/scan.ts`.
- [ ] `readKnownIds` branches covered: ENOENT path, non-JSON line, missing-id JSON line, blank line, valid line.
- [ ] No new TypeScript or lint warnings.

---

## Testing Strategy

### Unit Tests
- All in `tests/engine/scan.test.ts`. No new test file.
- Use `mkdtemp(join(tmpdir(), "cycle-test-"))` per test; clean up via `rm(root, {recursive,force})` in `finally`.
- Assertions via `readFile` / `readdir` of real fs paths — **no fs mocks**, no stubs.
- Branch coverage of `readKnownIds` driven by malformed-line test (covers JSON.parse throw + missing-id arm + blank-line skip + ENOENT via cold-start test).

### Integration / E2E Tests
- The four new tests above are themselves integration-level: real disk, real `scanTbd`, real JSONL.
- No end-to-end CLI test added — `runCycle` and `cli.ts` are out of scope; their behavior is unchanged because the returned array exclusion of dups means they observe "no new work" exactly as if the duplicate file had never been dropped.

## Risk Assessment
- **Risk**: rename succeeds but second `tbd/X.md` overwrites first in `queued/` losing body content.
  **Mitigation**: out of scope for this cycle (BRIEF says "move first to queued/"). Document via the intra-scan test using distinct filenames. Filing a follow-up issue if the body-loss case matters in production is a future concern.
- **Risk**: Returned-array policy change (now excludes dups) silently regresses callers that expected to "see" the re-staged file.
  **Mitigation**: only one caller (`src/cli.ts:48`); its semantics are "schedule a cycle per entry" — exclusion is the correct behavior. Documented in this plan.
- **Risk**: Pre-existing `tbd.jsonl` is huge (slow read).
  **Mitigation**: file grows linearly with cycles run; current usage is dozens of rows. `readFile` + line split is fine. Reconsider streaming only if it exceeds tens of MB.
- **Risk**: Coverage regression because new branches in `readKnownIds` aren't exercised.
  **Mitigation**: malformed-line test explicitly covers the catch arm; cold-start test covers ENOENT; happy paths cover the success arm. Verify via `npm run test:coverage` before commit.
- **Risk**: `JSON.parse` of a partially-written line during a crash mid-append leaves the Set short by one id.
  **Mitigation**: acceptable — worst case is one duplicate row on the next scan; SPEC's "no migration" stance covers this.
```
