Caller path bare `await terminalDrain(...)` — no swallowing wrapper. Re-throw propagates cleanly. Plan ready.

```markdown
# Implementation Plan: Cycle 0062

## Overview
Close recovery hole in `terminalDrain` (`src/cli.ts`): when `mutateFrontmatter` throws (most often: malformed/missing YAML on the popped todo), write `failed/<id>.md` from scratch via atomic tmp-rename with all stamps (`failed_at`, `failed_step?`, `failed_attempts`, `last_cycle_id`) plus a new `drain_error` forensic field, preserving original body bytes best-effort. Existing `queue.drain_warning` event keeps firing with identical reason shape; rest of the drain pipeline runs unchanged.

## Current State (from Research)
- `src/cli.ts:120-158` `terminalDrain`: catches `mutateFrontmatter` throw into `mutateErr`, then **unconditionally** `rename(todoPath, failed/<id>.md)`, emits `queue.drain_warning` only if `mutateErr` set. Result: failed/ file is the original malformed body — no stamps.
- `src/engine/frontmatter.ts:51-58` `serializeFrontmatter(fm, bodyAfter)`: pure, emits `---\n<k: v>…\n---\n<bodyAfter>`. Reusable for fallback. `Frontmatter` type accepts `string | number | string[]` — fits `drain_error` and numeric `failed_attempts` without schema change.
- `src/engine/frontmatter.ts:21-32` `parseFrontmatter`: throws `Error("no frontmatter")` when leading `---\n…\n---\n` regex misses. Returns `{ fm, bodyAfter }` on success — the bodyAfter is the canonical "preserve original body" payload.
- Atomic tmp-rename pattern modeled at `src/engine/frontmatter.ts:68-70`: `writeFile(path + ".tmp", out, "utf8")` then `rename(tmp, path)`.
- `src/cli.ts:1` imports `readFile, readdir, rename, mkdir` — `writeFile` must be added. `src/cli.ts:20` imports `parseFrontmatter, mutateFrontmatter` — `serializeFrontmatter` must be added.
- `terminalDrain` callers at `src/cli.ts:289` (resume) and `src/cli.ts:381` (main loop) `await` it bare — re-throw on fallback failure propagates up the normal error path; no upstream try/catch swallows.
- `tests/cli/queue-drain.test.ts:173-215` malformed-frontmatter test currently asserts only file presence in `failed/`, queue empty, and `queue.drain_warning` reason. SPEC requires extending it to assert every stamp on the failed/ body.
- `tests/cli/queue-drain.test.ts:139-171` happy-path stamp test must remain green byte-for-byte.

## Desired End State
- `terminalDrain` on `mutateFrontmatter` throw: best-effort `readFile(todoPath)` → try `parseFrontmatter(body)`; on success carry `fm` keys forward, on failure start empty. Build final `fm` with stamps + `drain_error: mutateErr.message`. `writeFile(failedPath + ".tmp", serializeFrontmatter(fm, bodyAfter), "utf8")` → `rename(tmp, failedPath)`. Unlink `todoPath` (ignore `ENOENT`). Continue with `queue.drain_warning` → `drainFailedTerminal` → `propagateBlocked` → `queue.drained` → `issue.failed` (same order, same payloads).
- Verify: `cat docs/cycle/issues/failed/<id>.md` shows valid frontmatter block containing all five fields followed by the original body. Run `tests/cli/queue-drain.test.ts`; both terminal-failure tests pass; `npm test` green; `npm run test:coverage` keeps gates (line ≥ 95% / branch ≥ 75% / function ≥ 90%, plus per-file `src/engine/triage.ts ≥ 95%`).

## What We're NOT Doing
- Retry / backoff for `mutateFrontmatter` failures.
- Changes to `drainSuccess`, `drainRetry`, `drainFailedTerminal`, `drainOk`, `propagateBlocked`.
- Changes to `mutateFrontmatter` or `serializeFrontmatter` themselves.
- Per-error-cause branching (EACCES vs ENOSPC vs malformed YAML). One uniform fallback path.
- Halt-policy / `consecutive_failures` semantics — counter still increments via caller path at `src/cli.ts:382`.
- Schema extension to `Frontmatter` type.
- Truncation cap on `drain_error.message` (one-shot forensic field, not a sink).
- A separate `drainFailedTerminalWithFallback` helper — keep the logic inline in `terminalDrain` (single call site).

## Implementation Approach
Single-file source change in `src/cli.ts`. Two-import extension (`writeFile` from `node:fs/promises`, `serializeFrontmatter` from `./engine/frontmatter.ts`). Replace the `mutateFrontmatter` try/catch + naive `rename` block (`src/cli.ts:130-153`) with: happy-path mutate-then-rename retained; on catch, fallback writes `failed/<id>.md` from scratch via atomic tmp-rename, then unlinks the original todoPath. `queue.drain_warning` continues to fire when `mutateErr` is set, immediately after the fallback write. `drainFailedTerminal` / `propagateBlocked` / `queue.drained` / `issue.failed` are emitted unchanged afterward.

Test changes are additive: extend the existing malformed-frontmatter test with stamp assertions plus a body-bytes-preserved assertion. Add one focused test for the "parses-but-write-failed" branch by pre-creating the `<todoPath>.tmp` location as a directory so `mutateFrontmatter`'s internal write fails with `EISDIR` after the parse succeeded — exercising the "preserve existing keys" branch of the fallback.

---

## Task 1: Add fallback write to `terminalDrain`

### Overview
Replace the catch-then-rename block in `terminalDrain` with a fallback that always produces a stamped, frontmatter-bearing `failed/<id>.md`, while keeping the happy path byte-identical.

### Changes Required

**File**: `src/cli.ts`

**Imports** (lines 1 and 20):
- Extend `node:fs/promises` import to include `writeFile` and `unlink`:
  ```ts
  import { readFile, readdir, rename, writeFile, unlink, mkdir } from "node:fs/promises";
  ```
- Extend frontmatter import:
  ```ts
  import { parseFrontmatter, mutateFrontmatter, serializeFrontmatter } from "./engine/frontmatter.js";
  ```
  (Verify the existing import path/extension; mirror current style.)

**Body** (replace lines 130-153 with the fallback structure):
```ts
let mutateErr: Error | null = null;
try {
  await mutateFrontmatter(todoPath, (fm) => ({
    ...fm,
    failed_at: new Date().toISOString(),
    ...(failingStep ? { failed_step: failingStep } : {}),
    failed_attempts: failedAttempts,
    last_cycle_id: cycleId,
  }));
} catch (e) {
  mutateErr = e as Error;
}

const failedPath = join(failedDir, `${issueId}.md`);

if (mutateErr) {
  // Fallback: write failed/<id>.md from scratch with stamps.
  // Preserve original body bytes best-effort; preserve original frontmatter keys
  // if the body parsed successfully (i.e. mutate failed during write, not parse).
  let originalBody = "";
  try {
    originalBody = await readFile(todoPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  let baseFm: Record<string, string | number | string[]> = {};
  let bodyAfter = originalBody;
  try {
    const parsed = parseFrontmatter(originalBody);
    baseFm = { ...parsed.fm };
    bodyAfter = parsed.bodyAfter;
  } catch {
    // body had no frontmatter; emit stamps only, keep raw bytes as the body
  }
  const fm: Record<string, string | number | string[]> = {
    ...baseFm,
    failed_at: new Date().toISOString(),
    ...(failingStep ? { failed_step: failingStep } : {}),
    failed_attempts: failedAttempts,
    last_cycle_id: cycleId,
    drain_error: mutateErr.message,
  };
  const out = serializeFrontmatter(fm, bodyAfter);
  const tmpPath = `${failedPath}.tmp`;
  await writeFile(tmpPath, out, "utf8");
  await rename(tmpPath, failedPath);
  try {
    await unlink(todoPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
} else {
  try {
    await rename(todoPath, failedPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

if (mutateErr) {
  await log.emit("queue.drain_warning", {
    cycle_id: cycleId,
    issue_id: issueId,
    reason: `mutateFrontmatter failed: ${mutateErr.message}`,
  });
}
await drainFailedTerminal(cwd, issueId);
await propagateBlocked(cwd, issueId, log);
await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "terminal" });
await log.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
```

Notes:
- Happy path collapses to the same single `rename` it does today — byte-identical for downstream tests.
- Fallback write throwing (`writeFile`/`rename`) propagates up to the caller naturally (no try/catch around it). Callers at `src/cli.ts:289` and `src/cli.ts:381` re-raise into the engine's normal exit path.
- `unlink` is used instead of `rename(todoPath, failedPath)` for the fallback because we've already written the destination from scratch; the source file is now stale and must be cleared. `ENOENT` is tolerated (file may already be gone if a concurrent fs op intervened).

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` green (all existing tests pass, including byte-for-byte happy-path stamp test at `tests/cli/queue-drain.test.ts:139-171`).
- [ ] No new events introduced; event ordering unchanged.
- [ ] Manual inspection: `cat docs/cycle/issues/failed/<id>.md` after a malformed-fm halt shows YAML frontmatter with all five stamp fields.

---

## Task 2: Extend malformed-frontmatter test with stamp assertions

### Overview
Tighten the existing "terminal failure with malformed frontmatter" test (`tests/cli/queue-drain.test.ts:173-215`) to pin the new contract: failed/`<id>`.md must carry `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`, `drain_error`. Original `"body only\n"` bytes must remain reachable after the frontmatter block.

### Changes Required

**File**: `tests/cli/queue-drain.test.ts`

After the existing block at lines 199-211 (file presence + queue empty + warning event), add:

```ts
const failedBody = await readFile(
  join(root, "docs/cycle/issues/failed", `${id}.md`),
  "utf8",
);
// Stamps must be present (loose regex per stamp — ordering is incidental).
assert.match(failedBody, /^failed_at:/m);
assert.match(failedBody, /^failed_step: boom$/m);
assert.match(failedBody, /^failed_attempts: 1$/m);
assert.match(failedBody, /^last_cycle_id: /m);
assert.match(failedBody, /^drain_error: .*mutateFrontmatter/m);
// Original body bytes preserved after the frontmatter block.
assert.match(failedBody, /\n---\nbody only\n$/);
```

Notes:
- Regex uses `/m` flag for per-line anchors so we don't accidentally match inside `drain_error`'s quoted message.
- The `drain_error` assertion matches against the YAML serializer's output. `serializeValue` (`src/engine/frontmatter.ts:42-49`) quotes when `needsQuote` fires (e.g. colon present). Either quoted or unquoted forms satisfy `/^drain_error: .*mutateFrontmatter/m` because the prefix `drain_error: ` is identical, and `mutateFrontmatter` appears in the literal message regardless of quoting. (Spot-check after running once; tighten if quoting flips it.)
- The body-tail anchor `\n---\nbody only\n$` confirms the frontmatter block closes correctly and the original bytes follow with no trailing junk.

### Success Criteria
- [ ] Test fails on master (pre-implementation) — proves it pins the SPEC contract.
- [ ] Test passes after Task 1.
- [ ] Existing `queue.drain_warning` assertion at line 211 still passes (reason string unchanged).

---

## Task 3: Add "parses-but-write-failed" branch test

### Overview
Cover the fallback's "preserve existing frontmatter keys" branch by forcing `mutateFrontmatter`'s internal write to fail (`EISDIR`) after the parse succeeds. Pre-create the todo file's `.tmp` sibling as a directory before the run; `mutateFrontmatter` does `writeFile(todoPath + ".tmp", …)` which fails with `EISDIR`, the catch fires, our fallback reads the (well-formed) todo body, parses it, carries the original keys forward, adds stamps, and writes `failed/<id>.md`.

### Changes Required

**File**: `tests/cli/queue-drain.test.ts`

Add a new `test(...)` block after the malformed test (insert before line 217 / the retry path test):

```ts
test("terminal failure with parseable fm but tmp-write blocked: file moves with stamps + original keys preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-qdrain-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root, boomYml(1), { "boom.sh": "#!/bin/bash\nexit 42\n" });

    const id = "wedged";
    const todoPath = join(root, "docs/cycle/issues/todo", `${id}.md`);
    await writeFile(
      todoPath,
      "---\ntitle: wedged\nkeep_me: original-value\n---\nreal body\n",
      "utf8",
    );
    // Trap: pre-create the .tmp sibling as a directory so mutateFrontmatter's
    // internal writeFile fails with EISDIR. Our fallback then takes over.
    await mkdir(`${todoPath}.tmp`, { recursive: true });
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify({
        id,
        title: "wedged",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      }) + "\n",
      "utf8",
    );

    const r = spawnSync("node", [dist, "run"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 1, "run should exit 1 on halt");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.equal(failedFiles.length, 1);
    assert.equal(failedFiles[0], `${id}.md`);

    const failedBody = await readFile(
      join(root, "docs/cycle/issues/failed", `${id}.md`),
      "utf8",
    );
    // Original key preserved.
    assert.match(failedBody, /^keep_me: original-value$/m);
    // Stamps present.
    assert.match(failedBody, /^failed_at:/m);
    assert.match(failedBody, /^failed_step: boom$/m);
    assert.match(failedBody, /^failed_attempts: 1$/m);
    assert.match(failedBody, /^last_cycle_id: /m);
    assert.match(failedBody, /^drain_error: /m);
    // Original body retained.
    assert.match(failedBody, /\n---\nreal body\n$/);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const warning = events.find((e) => e.event === "queue.drain_warning");
    assert.ok(warning, "queue.drain_warning event expected");
    assert.match(warning.reason, /mutateFrontmatter failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Notes:
- Imports `mkdir` from `node:fs/promises` — verify it's already in the test file's import list; if not, extend it.
- The directory trap on `${todoPath}.tmp` is portable (POSIX + Windows both fail `writeFile` on a directory path). If the trap proves flaky in CI, fall back to a write-seam stub via `--experimental-loader` — but the directory trap is preferred for SPEC's "easiest to simulate" guidance.
- The original key `keep_me` is the load-bearing assertion that distinguishes this branch from the malformed case.

### Success Criteria
- [ ] Test fails on master (pre-implementation, since the fallback doesn't exist).
- [ ] Test passes after Task 1.
- [ ] No new events introduced; warning emission unchanged.

---

## Task 4: Update docs

### Overview
Single-sentence touch to `CLAUDE.md`'s architecture reference; conditional touch to `README.md`'s recovery section if it enumerates frontmatter fields.

### Changes Required

**File**: `CLAUDE.md`

Extend the existing bullet under "Architecture quick reference" that mentions `terminalDrain` and the deferred `mutateFrontmatter` flush (currently in the triage subroutine paragraph: "partial-failure paths still move the failed subset to `failed/<id>.md` with `failed_step: "triage"` and `failed_at` stamped via the deferred `moveToFailed` flush"). Add one sentence:

> On terminal-drain mutation failure (malformed/missing frontmatter), the engine falls back to writing `failed/<id>.md` from scratch via atomic tmp-rename, preserving the original body bytes and recording the underlying cause in a `drain_error` frontmatter field alongside the standard stamps.

Locate the appropriate bullet — it lives in the bullet starting "Queue authority: `src/engine/queue.ts` owns `.cycle/tbd.jsonl`…" near the description of `terminalDrain`'s stamp behavior. If placement is ambiguous, add as a trailing sentence to that same bullet to avoid creating a new section.

**File**: `README.md`

Check "Recovering from `engine.paused`" section for an enumerated list of `failed/<id>.md` frontmatter fields. If present, append `- drain_error` to the list with a one-liner: "Set when the engine had to fall back to a write-from-scratch failed/ file because frontmatter mutation threw; value is the underlying mutation error message." If the section does NOT enumerate the fields, no change.

### Success Criteria
- [ ] `CLAUDE.md` carries the new sentence in the `terminalDrain` reference.
- [ ] `README.md` either updated or left untouched (only if its recovery section doesn't enumerate fields).
- [ ] No new docs files created; no new sections in existing docs.

---

## Testing Strategy

### Unit / Integration Tests
- All assertions live in `tests/cli/queue-drain.test.ts` — integration-style, real `dist/cycle.js` subprocess, real tmp git repo. No mocking. Reuses existing `bootstrapRepo`, `boomYml`, `ensureDist` helpers.
- Three relevant tests post-change:
  1. `tests/cli/queue-drain.test.ts:139-171` happy-path stamps — must remain byte-for-byte green (no code path change on success).
  2. Extended malformed-fm test (Task 2) — pins fallback contract including original body preservation.
  3. New parses-but-tmp-write-blocked test (Task 3) — pins the "preserve existing keys" branch.
- No new mock seams or test doubles. Directory-trap on the `.tmp` sibling is the only adversarial fixture — fully portable.

### Coverage
- `npm run test:coverage` must keep project-wide gates (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- No per-file floor for `src/cli.ts` in `scripts/coverage-gate.mjs` (only `src/engine/triage.ts ≥ 95%`); the new fallback block is exercised by Tasks 2 and 3, so net `src/cli.ts` line coverage should rise.

### Manual Verification
- Run a synthetic halt in a scratch dir with a malformed todo; inspect `failed/<id>.md` for all five stamp fields and trailing original body.

## Risk Assessment
- **Risk**: `serializeFrontmatter` quoting of `drain_error.message` mismatches the regex assertions in Tasks 2/3 (the message contains colons, which trips `needsQuote`).
  **Mitigation**: regex anchors on `^drain_error: ` only — the value side is `.*` or unanchored. Spot-check first run; if a quoted form sneaks past the prefix anchor, tighten with `/^drain_error: ["']?.*mutateFrontmatter/m`.
- **Risk**: Directory trap on `${todoPath}.tmp` flaps on a future Node release that auto-cleans tmp suffixes.
  **Mitigation**: Test asserts `r.status === 1` and the `queue.drain_warning` event; if the trap stops triggering, both assertions fail loudly rather than silently passing. If proven flaky, drop Task 3 entirely (SPEC permits) and document the gap in BUILD.md.
- **Risk**: `unlink(todoPath)` race with the same path on Windows filesystems.
  **Mitigation**: `ENOENT` is tolerated explicitly. Other errors re-throw — engine halts naturally.
- **Risk**: Adding `writeFile` / `unlink` / `serializeFrontmatter` imports breaks an unused-import lint rule.
  **Mitigation**: Both new imports are used in Task 1's body; no dead imports.
- **Risk**: Test setup writes `tbd.jsonl` and pre-creates `${todoPath}.tmp` as a directory — the test's helper imports (`mkdir` from `node:fs/promises`) may not yet exist in the test file.
  **Mitigation**: Verify imports at top of `tests/cli/queue-drain.test.ts` during Task 3 implementation; extend if missing.
```
