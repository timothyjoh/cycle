Read complete. Cycle 0049 = fault tests for `triage.ts` + per-file coverage gate ≥95%. Writing PLAN to stdout.

```markdown
# Implementation Plan: Cycle 0049

## Overview
Add a fault-isolation test file that asserts event + on-disk state across `triage.ts` catch clauses, install a per-file line-coverage gate (≥ 95% on `src/engine/triage.ts`) via a new `scripts/coverage-gate.mjs` parsing LCOV, and document the floor in `CLAUDE.md`.

## Current State (from Research)
- `src/engine/triage.ts` already sits at **line 98.33 / branch 94.92 / func 97.56** (RESEARCH §Test Infrastructure). The SPEC-cited 93.50% baseline is stale — intervening cycles tightened it.
- **Six uncovered line pairs remain**, all best-effort inner catches: `605-606, 615-616, 632-633, 645-646, 660-661, 665-666`. Five of the SPEC-named clauses map onto `645-646` (`bumpAttempts`), `660-661` + `665-666` (`moveToFailed`'s two sibling catches), and `rewriteOrdering` (no catch — atomicity invariant). `loadRaws` per-file body has no try/catch — fault tests assert "unhandled throw" behavior. `runAgentViaDispatch`'s synchronous `UnknownAgentError` is already covered (`triage.test.ts:799-825`).
- DI seam exists only for `runAgent` (`TriageDeps.runAgent`). For the other catches the existing fault-injection pattern is `chmod 0o400` / `0o500` + pre-create-as-directory (already used three places in `triage.test.ts`).
- No `node:test` `mock.method` usage in the repo despite SPEC reference. PLAN picks the existing `chmod`/DI pattern to match convention; resolves SPEC's `mock.method` reference as incorrect.
- Coverage runner is `node --test --experimental-test-coverage --test-reporter=spec`. Node 22.x supports `--test-reporter=lcov` and multiple reporters in one run via `--test-reporter-destination`. `--test-coverage-lines=` is aggregate-only — Node's built-in gate cannot do per-file. A custom LCOV parser is required.
- `npm run sync-defaults` divergence guard treats `.cycle/workflows.yml` as canonical-divergent; `.cycle/prompts/*` are non-divergent and will sync normally if we touch the default prompts (we won't this cycle — gate ships as a script, not prompt logic).

## Desired End State
- `tests/engine/triage.faults.test.ts` exists and exercises every SPEC-named fault clause (event + filesystem invariant), plus the three uncovered "best-effort inner" catches (`applyRaw` unlink-todo rollback `605-606`, `applyRaw` writeQueue rollback `615-616`, `atomicWrite` tmp-cleanup `632-633`) so the per-file number sits comfortably above 95%.
- `scripts/coverage-gate.mjs` parses `.cycle/coverage.lcov` and exits non-zero when `src/engine/triage.ts` line coverage drops below the hardcoded `{ "src/engine/triage.ts": 95 }` floor table. Wired into a new `npm run check:coverage` and invoked from `pretest:coverage` (so any `test:coverage` run gates automatically).
- `npm run test:coverage` writes both spec (stdout) and lcov (`.cycle/coverage.lcov`) reports via dual `--test-reporter` flags. `.gitignore` excludes `.cycle/coverage.lcov`.
- `CLAUDE.md` "Coverage policy" gains one bullet documenting the `src/engine/triage.ts ≥ 95% line` floor + a Commands-table entry for `npm run check:coverage`.
- `BUILD.md` records the red-then-green proof: temporarily raising the floor to a value that current coverage cannot meet, observing non-zero exit, restoring to 95%.
- Verification: `npm run test:coverage` exits 0; manually flipping the floor table entry to `100` exits non-zero with a clear "src/engine/triage.ts line 98.x% < 100% floor" message.

## What We're NOT Doing
- **Not** refactoring any catch in `triage.ts` (SPEC §Out-of-Scope). Dead-catch deletion is deferred.
- **Not** adding per-file floors for other `src/engine/*.ts` files. Gate table contains exactly one entry.
- **Not** raising the aggregate project baseline above 95 / 75 / 90.
- **Not** using `node:test` `t.mock.method` — SPEC's reference is incorrect, and we match the existing repo convention (chmod / DI). This is a SPEC-vs-RESEARCH reconciliation decision PLAN must record.
- **Not** touching `src/defaults/prompts/build.md` or `fix.md`. Gate is a script with exit code teeth (SPEC option a), not a prompt instruction (option b).
- **Not** changing `triage.ts` behavior (no new events, no message-shape changes).
- **Not** modifying `.cycle/workflows.yml` (canonical-divergent, see `CLAUDE.md`).

## Implementation Approach
Vertical slices, in order:

1. **Slice 1 — Coverage gate scaffolding (no triage tests yet).** Add `scripts/coverage-gate.mjs`, wire `--test-reporter=lcov` alongside `--test-reporter=spec` in `package.json`, add `npm run check:coverage`. Prove the gate works *before* writing fault tests by temporarily setting the floor table entry to a value above current coverage and confirming exit code 1 — this is the red half of the red-then-green proof. Revert floor to 95.
2. **Slice 2 — Fault tests.** Add `tests/engine/triage.faults.test.ts` with the five SPEC-named fault paths plus three opportunistic inner-catch tests. Each test owns its tmp repo, scopes chmod restores in `finally`. Confirm every test passes individually and `npm run test:coverage` shows triage.ts line ≥ 99%.
3. **Slice 3 — Documentation.** Update `CLAUDE.md` Coverage policy + Commands table.
4. **Slice 4 — Red-test proof recording.** Run gate with one fault test temporarily removed AND floor temporarily raised to a value the remaining tests can't meet, capture exit code + message in `BUILD.md`, restore both.

Each slice ends with `npm test` + `npm run test:coverage` clean (except Slice 1's deliberate gate-trip and Slice 4's red proof).

---

## Task 1: Add `scripts/coverage-gate.mjs` + dual-reporter wiring

### Overview
Build the per-file coverage gate before any tests change. This isolates the mechanism: if Slice 2 forgets a fault test, the gate catches it on the very same run.

### Changes Required

**File**: `scripts/coverage-gate.mjs` (new)
**Changes**: Node script that:
- Reads `.cycle/coverage.lcov` (path argv-overridable, defaults to `.cycle/coverage.lcov`).
- Parses minimal LCOV grammar: walk lines, track current `SF:<path>` block, read `LF:<int>` and `LH:<int>` per block, compute `pct = LH / LF * 100`.
- Hardcoded `FLOORS = { "src/engine/triage.ts": 95 }` constant at top of file (single source of truth — comment notes "extend this table to add more per-file floors").
- For each `(path, floor)` in `FLOORS`, look up the matching `SF:` block (paths in LCOV are repo-relative POSIX). Missing block → exit 2 with `coverage-gate: no LCOV block for <path> (did you run test:coverage?)`.
- If `pct < floor`, print `coverage-gate: <path> line coverage <pct.toFixed(2)>% < <floor>% floor` to stderr and accumulate failures. After the loop, exit 1 if any failed, else print one-line summary `coverage-gate: ok — <path> <pct>% ≥ <floor>%` per entry and exit 0.
- No external deps; pure `node:fs/promises` + string parsing. Shebang `#!/usr/bin/env node` so it can be invoked directly later if desired.

Example skeleton (illustrative; final code in the build step):
```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
const FLOORS = { "src/engine/triage.ts": 95 };
const LCOV = process.argv[2] ?? ".cycle/coverage.lcov";
const text = await readFile(LCOV, "utf8");
const blocks = new Map();
let cur = null, lf = 0, lh = 0;
for (const line of text.split("\n")) {
  if (line.startsWith("SF:")) { cur = line.slice(3); lf = 0; lh = 0; }
  else if (line.startsWith("LF:")) lf = Number(line.slice(3));
  else if (line.startsWith("LH:")) lh = Number(line.slice(3));
  else if (line === "end_of_record" && cur) { blocks.set(cur, { lf, lh }); cur = null; }
}
let failed = 0;
for (const [path, floor] of Object.entries(FLOORS)) {
  const b = blocks.get(path);
  if (!b) { console.error(`coverage-gate: no LCOV block for ${path}`); process.exit(2); }
  const pct = b.lf === 0 ? 100 : (b.lh / b.lf) * 100;
  if (pct < floor) { console.error(`coverage-gate: ${path} line coverage ${pct.toFixed(2)}% < ${floor}% floor`); failed++; }
  else console.log(`coverage-gate: ok — ${path} ${pct.toFixed(2)}% ≥ ${floor}%`);
}
process.exit(failed > 0 ? 1 : 0);
```

**File**: `package.json`
**Changes**:
- Replace `test:coverage` script with dual-reporter form so LCOV is emitted alongside the existing spec output:
  ```
  "test:coverage": "node --test --experimental-strip-types --experimental-test-coverage --test-coverage-exclude='dist/**' --test-coverage-exclude='tests/**' --test-coverage-exclude='scripts/**' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination=.cycle/coverage.lcov"
  ```
- Add new script: `"check:coverage": "node scripts/coverage-gate.mjs"`.
- Extend `pretest:coverage` to ensure `.cycle/` exists (already does via engine bootstrap, but make robust): `"pretest:coverage": "node scripts/build.mjs && mkdir -p .cycle"`. After `test:coverage` runs LCOV is on disk; chain with a `posttest:coverage` script: `"posttest:coverage": "node scripts/coverage-gate.mjs"`. (npm runs `posttest:coverage` automatically after `test:coverage` exits 0; the gate becomes the final word.)

**File**: `.gitignore`
**Changes**: Append `.cycle/coverage.lcov` so the artifact stays local. (Confirm the file is not currently tracked.)

### Success Criteria
- [ ] `node scripts/coverage-gate.mjs --help` does not exist (no flag parsing required; argv[2] is the lcov path).
- [ ] `npm run test:coverage` writes `.cycle/coverage.lcov` AND `posttest:coverage` runs `coverage-gate.mjs` automatically; full pipeline exits 0 on current code.
- [ ] Manually editing `FLOORS` to `{ "src/engine/triage.ts": 100 }` and re-running `npm run check:coverage` exits 1 with the expected stderr message. (Revert before commit; record in BUILD.md.)
- [ ] Manually deleting `.cycle/coverage.lcov` and running `npm run check:coverage` exits 2 with the "no LCOV block" message.
- [ ] `npm test` (no coverage) is unchanged — gate does not run on bare `npm test`.

---

## Task 2: Add `tests/engine/triage.faults.test.ts`

### Overview
Eight fault tests (five SPEC-named + three opportunistic inner-catch). Each test asserts emitted event(s) AND on-disk state; none use "does not throw" as its only assertion.

### Changes Required

**File**: `tests/engine/triage.faults.test.ts` (new)
**Changes**: Reuse the harness shape from `tests/engine/triage.test.ts`. Top of file:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, chmod, readFile, stat, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTriage } from "../../src/engine/triage.ts";
// Inline copies of setupRepo / makeLog / rawBody patterned on triage.test.ts:39-77
```

Then one `test(...)` per fault:

1. **`runAgentViaDispatch` fault: agent rejects, retry budget exhausted → file moved to `failed/`**
   - Setup: write one raw with `triage_attempts: 2` so first attempt this run is the last.
   - Pass `runAgent: async () => { throw new Error("synthetic spawn ENOENT"); }`.
   - Assert: `events` contains `triage.raw.failed` with `last_error` containing `agent failed:`; `docs/cycle/issues/failed/<id>.md` exists; `raw/<id>.md` does not exist; `tbd.jsonl` does not contain `<id>`.
   - Covers `processRawWithRetry` throw path (`triage.ts:113-119`) + the full `moveToFailed` happy path.

2. **`bumpAttempts` fault: raw file removed mid-flight → warning emitted, retry continues**
   - Setup: write two raws, both with `triage_attempts: 0`. Set up `runAgent` that, on first call for raw A, deletes `raw/A.md` from disk (via `fs.unlink`) and then throws (forces non-zero-exit path which calls `bumpAttempts`).
   - Assert: `events` contains `triage.warning` with `reason: "bump_attempts_failed"` (or whichever shape `bumpAttempts`'s catch emits — confirm via re-reading `triage.ts:638-647`; if catch is silent, assert via downstream behavior: raw A still completes retry loop without crashing, raw B processes normally).
   - Note: if catch is silent (no event emission), the assertion is on the survival behavior: `events` contains `triage.raw.failed` for A AND `triage.raw.ok` for B. The fault is proved by the absence of an unhandled rejection.
   - Covers `triage.ts:645-646`.

3. **`moveToFailed` fault A: stamp-pass `mutateFrontmatter` fails → rename still attempted**
   - Setup: write one raw with `triage_attempts: 2`. `runAgent` throws (forces terminal failure → `moveToFailed`). Before calling `runTriage`, register a wrapper that, when `moveToFailed` is about to stamp, the raw file has already been chmod'd to `0o000` (unreadable) — easier path: chmod the `raw/` directory to `0o500` after writing the raw, so the `mutateFrontmatter` `readFile` succeeds but `writeFile(tmp)` into `raw/` fails. Then chmod `failed/` writable so the rename can complete.
   - Assert: `events` contains `triage.raw.failed`; `failed/<id>.md` exists (proves rename happened despite stamp failure); the file's body is the original raw body (stamp did NOT apply).
   - Finally: restore chmod on `raw/`.
   - Covers `triage.ts:660-661`.

4. **`moveToFailed` fault B: raw file missing mid-flight → rename catch swallows, no crash**
   - Setup: write one raw with `triage_attempts: 2`. `runAgent` is wired to `fs.unlink` the raw file before throwing.
   - Assert: `events` contains `triage.raw.failed`; no `failed/<id>.md` exists; no unhandled rejection; loop completes (assert `events` ends with `triage.end` shape OR `runTriage` resolves successfully).
   - Covers `triage.ts:665-666`.

5. **`rewriteOrdering` fault: `.cycle/` becomes unwritable mid-pass → `tbd.jsonl` byte-for-byte unchanged**
   - Setup: write one raw, plus a pre-existing `tbd.jsonl` with deterministic content. `runAgent` returns valid children + ordering (forces `rewriteOrdering` to attempt a write). Immediately before the post-loop `rewriteOrdering` call, chmod `.cycle/` to `0o500`. The cleanest seam: pass a `runAgent` that on first call captures the tbd.jsonl bytes via `readFile` and then synchronously `chmodSync(".cycle", 0o500)` before returning. (Or do the chmod inside a `t.before` after a partial run.)
   - Easier alternative: pre-compute the SHA-256 of `tbd.jsonl` before calling `runTriage`; chmod `.cycle/` to `0o500` just after the agent runs by intercepting via `runAgent`. After `runTriage` rejects (or emits a warning + returns), re-chmod and re-read `tbd.jsonl`. Assert: bytes match (or sha256 matches).
   - Covers SPEC's atomicity assertion. `rewriteOrdering` itself has no catch; the assertion target is the `queue.ts:writeQueue` tmp-rename invariant.
   - Finally: `chmod(".cycle", 0o700)` before `rm` cleanup.

6. **`loadRaws` per-file fault: one raw has invalid frontmatter → unhandled rejection surfaces structured error** (per SPEC §Requirements: "surviving raws still processed; failing raw surfaces a structured event")
   - Setup: write three raws: A (valid), B (frontmatter missing `id:` key → `parseFrontmatter` throws), C (valid).
   - Run `runTriage`. SPEC says "surviving raws still processed". Current `loadRaws` does NOT have a per-file try/catch — it throws. The fault test PROVES this by asserting the throw. If the test reveals this gap, document in BUILD.md as a follow-up (do NOT fix this cycle — SPEC §Out-of-Scope excludes catch-clause refactoring).
   - **Decision**: write the test to assert current behavior (`await assert.rejects(runTriage(...), /id/)`), and note in BUILD.md that surviving-raw isolation is a deferred follow-up. This satisfies "fault-injection test for `loadRaws`" without violating Out-of-Scope.
   - Covers the `loadRaws` `readdir` ENOENT path (line 307-308) via a separate sub-test: delete `docs/cycle/issues/raw/` entirely → assert `runTriage` resolves with empty event stream + no errors.

7. **(Opportunistic) `applyRaw` rollback fault: unlink-todo rollback catch (`triage.ts:605-606`)**
   - Setup: agent returns a valid raw and a child; let `applyRaw` write `todo/<child>.md`, then force `appendRow` to fail via chmod `0o400` on `tbd.jsonl`. The rollback path tries to `unlink(todo/<child>.md)` — pre-create that path as a non-empty directory so `unlink` fails.
   - Assert: `events` contains `triage.raw.failed` with rollback warning; the test does not crash.
   - Covers `triage.ts:605-606`.

8. **(Opportunistic) `atomicWrite` tmp-cleanup catch (`triage.ts:632-633`)**
   - Setup: pre-create `todo/<child>.md` as a directory (forces `rename(tmp, target)` to fail). Pre-create `todo/<child>.md.tmp` as a directory too (forces `unlink(tmp)` inside the catch to fail).
   - Assert: `events` contains `triage.raw.failed`; loop continues for any subsequent raw.
   - Covers `triage.ts:632-633`.

### Success Criteria
- [ ] `npm test` passes with new tests included (target +8 tests).
- [ ] `npm run test:coverage` reports `src/engine/triage.ts` line ≥ 99% (current 98.33% + the inner catches).
- [ ] `npm run check:coverage` exits 0 with `src/engine/triage.ts <pct>% ≥ 95%` line in stdout.
- [ ] Removing any single fault test does NOT drop coverage below 95% (gate stays green) — this is expected, and the red proof is achieved via a different mechanism (Task 4).
- [ ] No `chmod` leaks: every test restores permissions in `finally` before `rm` cleanup.

---

## Task 3: Document the per-file floor in `CLAUDE.md`

### Overview
Add one bullet under "Coverage policy" and one row in the Commands table. Documentation is acceptance-criteria-blocking per SPEC §Documentation Updates.

### Changes Required

**File**: `CLAUDE.md`
**Changes**:
- Under "Coverage policy" (around line 48-56), append after the function bullet:
  ```
  - **Per-file floor — `src/engine/triage.ts` line ≥ 95%**. Enforced by `scripts/coverage-gate.mjs` (LCOV-driven, exits non-zero on regression). Rationale: `triage.ts` is the only writer that mutates `tbd.jsonl` and moves files out of `raw/`; a regression there directly threatens queue integrity. The floor table inside `coverage-gate.mjs` is the single source of truth — extend it (don't broaden globally) to add more per-file floors.
  ```
- Under "Commands" table (around line 28-35), insert after the `test:coverage` row:
  ```
  | `npm run check:coverage` | Parse `.cycle/coverage.lcov` and enforce per-file line floors (`src/engine/triage.ts ≥ 95%`). Exits 1 on regression, 2 if LCOV missing or path absent. Auto-runs as `posttest:coverage`. |
  ```
- Confirm no other `CLAUDE.md` sections need touch (e.g., the "Runtime" or "Subprocess discipline" sections are unrelated).

### Success Criteria
- [ ] `grep -n "triage.ts ≥ 95%" CLAUDE.md` returns one match in the Coverage policy section.
- [ ] `grep -n "check:coverage" CLAUDE.md` returns one match in the Commands table.
- [ ] `npm run typecheck` clean (no-op for markdown but sanity-check no incidental TS changes leaked).

---

## Task 4: Record the red-then-green gate proof in `BUILD.md`

### Overview
SPEC §Scope third bullet requires a deliberate-red verification with the observation recorded in BUILD.md. The proof targets the mechanism, not coverage erosion: temporarily raise the floor higher than current coverage, observe exit 1, revert.

### Changes Required

**File**: `BUILD.md` (cycle artifact — written by `build` step normally; this Plan instructs the build step to include the proof block).
**Changes**: In the `build` step's BUILD.md output, include a section:
```
## Coverage gate red-then-green proof

1. Set `FLOORS = { "src/engine/triage.ts": 100 }` in scripts/coverage-gate.mjs.
2. `npm run check:coverage` → exit 1, stderr: `coverage-gate: src/engine/triage.ts line coverage 99.XX% < 100% floor`.
3. Reverted FLOORS to `{ "src/engine/triage.ts": 95 }`.
4. `npm run check:coverage` → exit 0, stdout: `coverage-gate: ok — src/engine/triage.ts 99.XX% ≥ 95%`.
```
Plus the standard coverage table BUILD.md normally records (line / branch / function for `src/` and the per-file `triage.ts` numbers).

No git diff for `coverage-gate.mjs` ships in the final commit — the FLOORS change is local and reverted before commit. The proof is captured as a textual record in BUILD.md only.

### Success Criteria
- [ ] BUILD.md contains the red-then-green block with both exit codes and both stderr/stdout messages quoted verbatim.
- [ ] Final `git diff scripts/coverage-gate.mjs` shows only the canonical 95 floor, no 100.
- [ ] `npm run test:coverage` end-to-end (which now runs the gate via `posttest:coverage`) exits 0 in the final commit.

---

## Testing Strategy

### Unit Tests
- All fault tests are integration-shaped (real fs, real `runTriage`), per repo convention. No mocking framework. Two seams: (1) `TriageDeps.runAgent` injection (5 of 8 tests), (2) filesystem-permission injection via `chmod` (4 of 8 tests — overlap with #1 where the agent stub also chmods).
- **Anti-mock note**: No `node:test` `mock.method` despite SPEC reference. RESEARCH confirms the repo has zero `mock.method` calls; matching the existing `chmod`/DI pattern keeps the suite uniform and avoids introducing a new mocking style for one cycle.
- Edge cases covered by the 8 tests:
  - Agent throws synchronously (DI seam).
  - Agent throws after partially mutating disk (raw deleted).
  - `mutateFrontmatter` write fails (raw/ chmod'd unwritable).
  - `rename` source-missing (raw deleted mid-flight).
  - `rename` target-is-directory + tmp-is-directory (two-step atomicWrite failure).
  - Queue tmp write fails (.cycle/ chmod'd unwritable) — atomicity assertion.
  - `parseFrontmatter` throws inside `loadRaws` loop (no per-file isolation — asserts current behavior, flags follow-up).
  - `readdir` ENOENT on `raw/` (returns `[]`).

### Integration / E2E Tests
- The 8 fault tests ARE the integration tests — each runs the full `runTriage` pipeline in a tmp repo with real fs and a stubbed agent. No CLI-layer (`cycle triage --dry-run`) test is added this cycle; the dry-run command is already covered by `tests/cli/triage-dry-run.test.ts`.

### Coverage gate self-test
- `scripts/coverage-gate.mjs` is exercised by `posttest:coverage` on every coverage run — no separate test file for the parser. The red-then-green proof in BUILD.md serves as the manual self-test record. If the parser grows past ~50 LOC during build, add `tests/scripts/coverage-gate.test.ts` as a follow-up cycle, not this one (YAGNI for a 30-line LCOV walker).

## Risk Assessment

- **Risk: `bumpAttempts`/`moveToFailed` catches may be silent (no event emission) so "assert event emitted" is impossible.**
  Mitigation: Re-read `triage.ts:638-666` during Slice 2 implementation. If catches are silent, switch each affected test's primary assertion to the filesystem-state invariant (raw file presence/absence, `tbd.jsonl` row count) and survival behavior (subsequent raws still processed). SPEC §Requirements says "asserting on the emitted event AND the resulting on-disk queue/file state" — if no event is emitted, the on-disk state assertion alone satisfies the "not 'does not throw'" rule. Note the SPEC-vs-code reconciliation in BUILD.md.

- **Risk: chmod-based fault injection unreliable on root/CI environments where the test runner has CAP_DAC_OVERRIDE.**
  Mitigation: Match the existing pattern from `triage.test.ts:686-687, 727, 771-774` — already in CI today, so the same approach will work or fail identically. If CI runs as root and bypasses chmod, the pre-create-as-directory pattern (used in two of the eight tests) still triggers `EISDIR` / `ENOTDIR` regardless of permissions. Prefer pre-create-as-directory over chmod where both options exist (e.g., for `moveToFailed` fault A, pre-create `failed/<id>.md` as a non-empty directory instead of chmod'ing `raw/`).

- **Risk: LCOV path format mismatch (absolute vs relative).**
  Mitigation: Node's LCOV reporter emits repo-relative POSIX paths (verified per RESEARCH §Dependencies). If `SF:` lines come back absolute on some host, `coverage-gate.mjs` should `path.relative(process.cwd(), sfPath)` before matching. Add this normalization preemptively in the script (cheap insurance, two lines).

- **Risk: `--test-reporter=lcov` differs subtly across Node patch versions on the per-file accounting.**
  Mitigation: Pin behavior assumption to Node 22.22.2 (the repo's documented floor). If `LF:`/`LH:` ever drift, the gate exits 2 with "no LCOV block" or reports an impossible-looking percentage — both are visible failures, not silent regressions.

- **Risk: `posttest:coverage` runs even when `test:coverage` fails (npm runs post-hooks on failure).**
  Mitigation: This is desirable — if tests fail, coverage is incomplete, gate exits 2 ("no LCOV block" or missing-file). The signal is louder, not quieter. If false positives become noisy, swap to chaining: `"test:coverage": "node --test ... && node scripts/coverage-gate.mjs"`. Defer that decision to actual observed friction.

- **Risk: Adding `.cycle/coverage.lcov` to `.gitignore` conflicts with an existing rule.**
  Mitigation: Read `.gitignore` first; if `.cycle/` is already wholesale-ignored, no new line needed. If only specific `.cycle/*` files are ignored, append.
```

PLAN written. Total: 4 tasks, 8 fault tests, 1 new script, package.json + .gitignore + CLAUDE.md edits, red-then-green proof recorded in BUILD.md. Resolves all 5 RESEARCH open questions inline (gate=option a/LCOV, injection=chmod+DI not mock.method, rewriteOrdering=chmod .cycle/, floor table=hardcoded, inner catches=in-scope opportunistic).
