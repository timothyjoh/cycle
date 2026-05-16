Permission system blocking MUST-FIX.md write — same issue that blocked the build agent. Outputting both documents directly.

---

# Review: Cycle 0096

## Overall Verdict
**NEEDS-FIX** — build agent was blocked by the permission system and shipped zero implementation. All three SPEC tasks are unimplemented.

NEEDS-FIX triggers: zero spec compliance (0/11 acceptance criteria met), zero new tests, zero CLAUDE.md update.

## Code Quality Review

### Summary
The build step returned `status:ok` and `exit_code:0` but BUILD.md reads verbatim: "Permission needed for `src/engine/reflection.ts`. Please allow the write, then I'll continue." The agent was denied write access, produced no edits, and exited 0. This is a false-positive build — the engine logged success for a cycle that delivered nothing.

### Findings
1. **Missing implementation**: `src/engine/reflection.ts` has no dedup gate, no `normalizeFilename`, `normalizeTitle`, or `readDirFailOpen` helpers, no `suppressed` counter, and no conditional `suppressed_count` on `reflection.summary` — `src/engine/reflection.ts:66-127`
2. **Missing tests**: `tests/engine/reflection.test.ts` is 589 lines, unchanged from pre-cycle state. Zero new test cases added.
3. **Missing doc update**: `CLAUDE.md:73` "Reflection step" bullet has no mention of the dedup gate, `reflection.skipped { reason: "dedup" }`, `reflection.warning { reason: "dedup_read_error" }`, or `suppressed_count`.
4. **False-positive build exit**: Build step returned exit_code 0 despite making zero changes. This is the recurring permission-blocking pattern.

### Spec Compliance Checklist
- [ ] Entry whose normalized title slug matches a filename in `todo/` is suppressed
- [ ] Entry whose normalized title slug matches a filename in `blocked/` is suppressed identically
- [ ] Entry with no matching filename is written to `raw/` as normal
- [ ] ENOENT on `todo/` handled gracefully
- [ ] ENOENT on `blocked/` handled gracefully
- [ ] Both dirs empty → no suppression
- [ ] Non-ENOENT `readdir` error emits `reflection.warning { reason: "dedup_read_error" }` and fails open
- [ ] `reflection.summary.count` equals written files; `suppressed_count` present when suppressed
- [ ] All existing `reflection.test.ts` tests remain green (unchanged; still true)
- [ ] `npm test` passes; `npm run typecheck` passes (true only because nothing changed)
- [ ] Coverage does not decrease (true only because nothing changed)

## Adversarial Test Review

### Summary
Weak — no new tests exist. The 434-test suite passes but only exercises pre-existing behavior.

### Findings
1. **All 7 required test cases missing**: todo/ suppression, blocked/ suppression, no-match pass-through, ENOENT on todo/, ENOENT on blocked/, both dirs empty, non-ENOENT fail-open — none present in `tests/engine/reflection.test.ts`
2. **No coverage of new branches**: The three branches in `readDirFailOpen` (happy path, ENOENT, other error) and the dedup true/false branch in the entry loop are entirely untested because the code doesn't exist.

### Test Coverage
- Command run: `npm test` (434 tests, 0 failures)
- Line / branch / function: Unchanged from master baseline (no new code)
- Regressions vs base: None (nothing changed)
- New code without tests: N/A — no new code
- Specific scenarios missing tests: All 7 dedup scenarios from SPEC §Testing Strategy

## Doc-vs-Code Claim Verification

No documentation prose changed (no commits, no diff against HEAD); pass skipped.

---

# Must-Fix Items: Cycle 0096

## Summary
1 critical issue: build blocked by permission system, zero implementation shipped. All three tasks are unimplemented.

## Tasks

- [ ] ### Task 1: Implement dedup gate in `src/engine/reflection.ts`
  **Priority:** Critical
  **Files:** `src/engine/reflection.ts`
  **Problem:** Build agent was denied write access. File is identical to pre-cycle state — no `normalizeFilename`, `normalizeTitle`, `readDirFailOpen`, no `suppressed` counter, no dedup check, no `suppressed_count` in summary. Zero of 11 acceptance criteria met.
  **Fix:** Apply five changes as specified in PLAN.md Task 1:

  **Change A** — after `let skipped = 0;` at line 69, add:
  ```typescript
  let suppressed = 0;
  ```

  **Change B** — after line 66 (`const entries = …`), insert dedup-entry build block:
  ```typescript
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
  ```

  **Change C** — inside the for loop, after `const e = raw as SharpEdge;` (line 86), before `let slug = …`:
  ```typescript
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
  ```

  **Change D** — update `reflection.summary` emit (lines 120-124):
  ```typescript
  await log.emit("reflection.summary", {
    cycle_id: cycleId,
    count: written.length,
    skipped,
    ...(suppressed > 0 ? { suppressed_count: suppressed } : {}),
  });
  ```

  **Change E** — add three helpers after `atomicWrite` at line 228:
  ```typescript
  function normalizeFilename(name: string): string {
    return name.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  async function readDirFailOpen(dir: string, log: Logger, cycleId: string): Promise<string[]> {
    try {
      return await readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      await log.emit("reflection.warning", { cycle_id: cycleId, reason: "dedup_read_error", dir, error: String(e) });
      return [];
    }
  }
  ```
  **Verify:** `npm run typecheck` exits 0; `grep -c "normalizeFilename" src/engine/reflection.ts` returns `2` (definition + call site).

- [ ] ### Task 2: Add 7 dedup test cases to `tests/engine/reflection.test.ts`
  **Priority:** Critical
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** File still 589 lines. All 7 test cases from PLAN.md Task 2 are missing.
  **Fix:** Append the 7 test cases verbatim from PLAN.md Task 2 after line 589. Confirm `mkdir`, `writeFile`, `rm` are imported from `node:fs/promises` at the top of the file; add any missing ones.
  **Verify:** `npm test` exits 0 with **441** tests passing.

- [ ] ### Task 3: Update CLAUDE.md `src/engine/reflection.ts` architecture note
  **Priority:** Critical
  **Files:** `CLAUDE.md`
  **Problem:** `CLAUDE.md:73` "Reflection step" bullet has no mention of dedup gate, `reflection.skipped { reason: "dedup" }`, `reflection.warning { reason: "dedup_read_error" }`, or `suppressed_count`. SPEC §Documentation Updates requires this.
  **Fix:** In `CLAUDE.md:73`, after `"In-pass slug collisions get a numeric suffix (\`-2\`, \`-3\`, …)."` and before `"On \`JSON.parse\` failure…"`, insert:

  > Before the per-entry write loop, `ingestReflection` reads `docs/cycle/issues/todo/` and `docs/cycle/issues/blocked/` and builds a normalized filename set; any `sharp_edges` entry whose normalized title slug (lowercase, non-alphanumeric→`-`, trimmed, capped at 60 chars) is a substring of a normalized filename is suppressed — emitting `reflection.skipped { reason: "dedup", cycle_id, title, matched_file }` — and not written to `raw/`. ENOENT on either directory is treated as empty (no warning). Any other `readdir` error emits `reflection.warning { reason: "dedup_read_error", dir, error }` and skips dedup for that directory only (fail-open). `reflection.summary` gains `suppressed_count` (number) when ≥ 1 entry was suppressed.

  **Verify:** `grep -c "dedup_read_error" CLAUDE.md` returns `1`; `grep -c "suppressed_count" CLAUDE.md` returns `1`.

---

**MUST-FIX.md write was blocked by the permission system** (same root cause as the build failure). The fix step will need write access to `docs/cycle/0096-feature-add-todo-blocked-dedup-gate-to-ingestref/MUST-FIX.md` approved, or the engine will loop again with an empty fix target.
