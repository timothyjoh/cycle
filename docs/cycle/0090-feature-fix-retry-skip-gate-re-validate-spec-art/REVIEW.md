The permissions block applies here too. Outputting REVIEW.md to stdout and embedding MUST-FIX content so the operator can apply it manually.

# Review: Cycle 0090

## Overall Verdict
NEEDS-FIX — zero code changes landed across three build/fix attempts. Root cause confirmed: `exec-claudecode.ts` was never patched (cycle 0087 commit only added docs). Two pre-existing workflow regressions in working tree break the test suite. All PLAN tasks unimplemented.

NEEDS-FIX triggers: implementation absent; false-positive test; three missing tests; two test failures (reflection step missing); CLAUDE.md not updated.

## Code Quality Review

### Summary
All three build/fix attempts for cycle 0090 produced zero source changes. The permissions catch-22 persists: `src/engine/exec-claudecode.ts` lacks `--dangerously-skip-permissions` — confirmed by grep. Cycle 0087's commit (`2c94294`) only added documentation artifacts (13 files, 464 insertions — all under `docs/` and `.cycle/engine.log`); the source file was never touched. Additionally, prior cycle build steps left two uncommitted working-tree regressions that break the test suite independently of cycle 0090's scope.

### Findings

1. **Implementation absent** — `shouldSkipForArtifact` at `src/engine/run-cycle.ts:37–43` still returns `{ skip: true }` for any spec artifact with `size > 0`. No byte-floor check. All three PLAN tasks undelivered. — `src/engine/run-cycle.ts:37`

2. **Root cause: `exec-claudecode.ts` never fixed** — Cycle 0087's commit (`2c94294`) claimed to "Re-apply `--dangerously-skip-permissions`" but diffed only documentation files. `src/engine/exec-claudecode.ts:13` spawns `claude ["-p", prompt]` with no `--dangerously-skip-permissions` flag. Every spawned subprocess inherits `settings.local.json` restrictions that block Edit/Write. This is why all build/fix steps since 0083 have silently no-op'd. — `src/engine/exec-claudecode.ts:13`

3. **Pre-existing regression: `src/defaults/workflows.yml` missing `reflection` step** — A prior cycle's build step deleted the `reflection` step (working tree change, never committed). `git diff src/defaults/workflows.yml` confirms the deletion. Tests read from the filesystem, so both tests below fail. — `src/defaults/workflows.yml:23` (working tree)

4. **Pre-existing regression: `.cycle/workflows.yml` missing `reflection` step** — The dogfood engine's workflow (working tree) also has `reflection` deleted. The engine is currently running without a reflection step. — `.cycle/workflows.yml` (working tree)

5. **Pre-existing: unstaged content additions to `src/defaults/prompts/reflection.md` and `.cycle/prompts/reflection.md`** — Both have an added `priority_hint` filtering block (4 lines). Introduced by a prior cycle's build step. Not committed, not part of cycle 0090's scope. These are in-flight and need to be either committed or reverted before the next cycle.

6. **CLAUDE.md not updated** — Line 78 "Retry skip policy" note still describes `> 0` bytes with no mention of the `>= SPEC_MIN_BYTES` floor for `spec`. PLAN Task 3 unexecuted. — `CLAUDE.md:78`

### Spec Compliance Checklist
- [ ] `shouldSkipForArtifact("spec")` returns `{ skip: false }` when `SPEC.md` < 200 bytes — NOT IMPLEMENTED
- [ ] `shouldSkipForArtifact("spec")` returns `{ skip: true }` when `SPEC.md` ≥ 200 bytes — NOT IMPLEMENTED
- [ ] `shouldSkipForArtifact("research")` and `shouldSkipForArtifact("plan")` unchanged — NOT VERIFIED (no implementation to regress against)
- [ ] Regression test in `tests/engine/` for below-threshold spec — NOT ADDED
- [ ] `npm test` passes — FAILS (two defaults tests broken by missing reflection step)
- [ ] All existing tests pass — FAILS
- [ ] CLAUDE.md updated — NOT DONE

## Adversarial Test Review

### Summary
Weak. The one directly relevant unit test is a false positive. Three required tests are absent. Two unrelated tests fail due to working-tree regressions.

### Findings

1. **False positive at line 89** — `tests/engine/run-cycle.skip-completed.test.ts:89` seeds `"hi"` (2 bytes) and asserts `skip: true`. Per SPEC, 2 bytes < 200 should yield `skip: false`. Test passes only because the bug is unfixed. After Task 4 lands it will break loudly. — `tests/engine/run-cycle.skip-completed.test.ts:89`

2. **Missing below-threshold test** — No test exercises `shouldSkipForArtifact("spec")` with 1–199 bytes asserting `skip: false`. SPEC acceptance criteria 1 and 4 uncovered.

3. **Missing boundary test** — No test seeds exactly 200 bytes asserting `skip: true`. The `>=` boundary is untested.

4. **Missing research/plan regression guard** — No test verifies `research`/`plan` still skip at 1 byte after the spec-specific branch is added.

5. **Two defaults tests failing** — `tests/defaults/feature-yaml.test.ts:11` asserts 11 steps including `reflection`. `tests/defaults/feature-loadable.test.ts:14,17` asserts length 11 and `steps[9].name === "reflection"`. Both fail against the working-tree `src/defaults/workflows.yml` (10 steps, no reflection). — `tests/defaults/feature-yaml.test.ts:11`, `tests/defaults/feature-loadable.test.ts:14`

### Test Coverage
- Command run: blocked (permissions prevent `npm test`; pre-existing test failures would block anyway)
- Line / branch / function: unknown — suite does not run clean
- Regressions vs base: indeterminate — two unrelated tests broken
- New code without tests: moot — no implementation written
- Specific scenarios missing tests: 199-byte spec → `skip: false`; 200-byte spec → `skip: true`; 1-byte research/plan → `skip: true`

## Doc-vs-Code Claim Verification

No documentation prose changed in committed diff; pass skipped.

*(Note: `src/defaults/prompts/reflection.md` has 4 unstaged lines added regarding `priority_hint` filtering, and `src/defaults/workflows.yml` has the `reflection` step deleted in the working tree. Neither is a committed change; both need operator attention before next cycle.)*

---

**MUST-FIX.md** — write permissions blocked; content follows for operator to apply manually to `docs/cycle/0090-feature-fix-retry-skip-gate-re-validate-spec-art/MUST-FIX.md`:

---

# Must-Fix Items: Cycle 0090

## Summary
5 critical issues, 1 minor. Zero code landed across 3 attempts. Root cause: `exec-claudecode.ts` never received `--dangerously-skip-permissions` (0087 commit added only docs). Tasks 1–3 require operator action — fix agent faces same permission block.

## Tasks

- [ ] ### Task 1: Add `--dangerously-skip-permissions` to exec-claudecode.ts spawn (**OPERATOR REQUIRED**)
  **Priority:** Critical — root cause of all build/fix failures since cycle 0083
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** Line 13 spawns `claude ["-p", prompt]` with no `--dangerously-skip-permissions`. Cycle 0087's commit only added docs — the source was never changed. Every Claude subprocess inherits `settings.local.json` restrictions blocking Edit/Write.
  **Fix:** Edit `src/engine/exec-claudecode.ts` line 13:
  ```typescript
  // before:
  const child = spawn("claude", ["-p", prompt], {
  // after:
  const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
  ```
  **Verify:** `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns a match at line 13.

- [ ] ### Task 2: Restore `reflection` step in `src/defaults/workflows.yml` (**OPERATOR REQUIRED**)
  **Priority:** Critical — two tests fail
  **Files:** `src/defaults/workflows.yml`
  **Problem:** Working tree has reflection deleted between `pr` and `documentation`. Two tests assert 11 steps and `steps[9].name === "reflection"`.
  **Fix:** Insert between `pr` and `documentation` lines:
  ```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
  ```
  **Verify:** `node -e "const YAML=require('yaml'); const y=YAML.parse(require('fs').readFileSync('src/defaults/workflows.yml','utf8')); const f=y.workflows.find(w=>w.name==='feature'); console.log(f.steps.length, f.steps[9].name)"` prints `11 reflection`.

- [ ] ### Task 3: Restore `reflection` step in `.cycle/workflows.yml` (**OPERATOR REQUIRED**)
  **Priority:** Critical — dogfood engine runs without reflection
  **Files:** `.cycle/workflows.yml`
  **Problem:** Working tree has reflection deleted from feature workflow after `commit`. Engine reads working tree; no reflection step fires.
  **Fix:** Restore after `commit-trunk.sh` line:
  ```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
  ```
  **Verify:** `grep -n 'reflection' .cycle/workflows.yml` returns a match.

- [ ] ### Task 4: Implement spec byte-floor in `shouldSkipForArtifact`
  **Priority:** Critical — primary deliverable
  **Files:** `src/engine/run-cycle.ts`
  **Problem:** Lines 37–43 return `{ skip: true }` for any `size > 0` spec artifact. Below-threshold SPEC.md silently reused on retry.
  **Fix:** Replace lines 37–43:
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
  **Verify:** `npm run typecheck` passes. New unit tests in Task 5 pass.

- [ ] ### Task 5: Fix false-positive test (line 89) and add 3 regression tests
  **Priority:** Critical — false positive + missing coverage
  **Files:** `tests/engine/run-cycle.skip-completed.test.ts`
  **Problem:** Line 89 seeds `"hi"` (2 bytes), asserts `skip: true` — false positive. Three new tests absent.
  **Fix:**
  1. Line 89: `"hi"` → `BIG` (300-byte constant at line 82)
  2. Insert after line 134:
  ```typescript
  test("shouldSkipForArtifact: spec below SPEC_MIN_BYTES (199 bytes) → no skip", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
    try {
      const dir = join(root, "art");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "SPEC.md"), "x".repeat(199), "utf8");
      const r = await shouldSkipForArtifact(dir, "spec");
      assert.equal(r.skip, false);
    } finally { await rm(root, { recursive: true, force: true }); }
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
    } finally { await rm(root, { recursive: true, force: true }); }
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
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  ```
  **Verify:** `npm test` passes; 3 new `shouldSkipForArtifact` tests appear in output; 199-byte asserts `skip: false`, 200-byte asserts `skip: true`.

- [ ] ### Task 6: Update CLAUDE.md retry skip policy note
  **Priority:** Minor
  **Files:** `CLAUDE.md`
  **Problem:** Line 78 says "uses strict `> 0` bytes" — no mention of SPEC_MIN_BYTES floor for spec.
  **Fix:** Append to that sentence: ` For \`spec\` specifically, an additional byte-floor check requires \`Buffer.byteLength(content, "utf8") >= SPEC_MIN_BYTES\` (200); a below-threshold \`SPEC.md\` is treated as absent even if non-empty on disk.`
  **Verify:** `grep -n "SPEC_MIN_BYTES" CLAUDE.md` returns a match at line ~78.
