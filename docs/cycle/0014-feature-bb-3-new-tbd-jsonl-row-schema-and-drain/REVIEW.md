REVIEW.md (engine captures stdout):

```markdown
# Review: Cycle 0014

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

## Code Quality Review

### Summary
Implementation lands all six SPEC requirements with clean module
boundaries (`queue.ts`, `frontmatter.ts`, `blocked.ts`). All 135 tests
pass on a clean run; coverage holds at line 98.60% / branch 86.40% /
function 94.52%, above the `CLAUDE.md` baseline (≥95 / ≥75 / ≥90).
Two real defects: a non-deterministic build race in the new integration
suite under `npm run test:coverage`, and a silent-swallow in the
terminal-failure path that can orphan a todo file when frontmatter
mutation throws. A handful of minor cleanups.

### Findings
1. **Test/build race**: `tests/cli/queue-drain.test.ts:10-14` assumes
   `dist/cycle.js` exists; `tests/cli/multi-loop.test.ts:13-19, :44-49`
   still auto-builds when missing, and `scripts/build.mjs:4` does
   `rm -rf dist`. Parallel runs delete the bundle mid-test. Reproduced
   one `Cannot find module .../dist/cycle.js` failure on first
   `npm run test:coverage` invocation in this review. BUILD.md flags
   it as a known follow-up — must land in this cycle since coverage is
   a required gate.
2. **Orphan on terminal failure**: `src/cli.ts:127-137` wraps both
   `mutateFrontmatter` and `rename(todoPath, failedDir)` in one bare
   `try/catch` whose comment claims "tolerate missing file." If
   `mutateFrontmatter` throws (e.g. todo file missing frontmatter, or
   missing trailing `\n` after `---`), the rename is skipped, the
   catch silently eats it, and `drainFailedTerminal` (cli.ts:138) still
   removes the queue row. End state: file stuck in `todo/` with no
   queue tracking; engine will not re-process it.
3. **Redundant dynamic import**: `src/cli.ts:62` does
   `await import("./engine/queue.ts")` to pull `readQueue`, but the same
   module is statically imported at lines 10–16. Inconsistent with the
   rest of the file.
4. **Dead `?? "unknown"`**: `src/cli.ts:131` has
   `failed_step: r.failingStep ?? "unknown"`, but `runCycle`
   (`src/engine/run-cycle.ts:64`) only returns failed results with
   `failingStep` set. Unreachable fallback.
5. **`max_cycle_attempts < 1` clamp**: `src/cli.ts:98` clamps invalid
   values to 1 (`rawMax < 1 ? 1 : rawMax`). SPEC R6 says "default 3 if
   absent" but is silent about negative/zero — defensive clamp is
   reasonable but undocumented; PLAN.md risk note mentioned a guard
   without specifying behavior. Minor.
6. **`drainOk` ≡ `drainFailedTerminal`**: both remove the matching row
   (`src/engine/queue.ts:151-155`, `:169-173`). Acceptable for forward
   evolvability (BB-6 may diverge), but worth a comment if kept.

### Spec Compliance Checklist
- [x] R1 — `queue.ts` schema + ops shipped
- [x] R2 — bootstrap archive idempotent, numeric suffix on collision
- [x] R3 — `cycle.end` ok/retry/terminal drains implemented
- [x] R4 — workflow read from todo frontmatter, falls back to CLI default
- [x] R5 — `markInProgress` runs before `cycle.start` is emitted
- [x] R6 — `max_cycle_attempts` read from active workflow config,
      default 3
- [x] CLAUDE.md "Architecture quick reference" note added
- [x] Subprocess discipline preserved (array args, no shell)
- [x] Atomic moves (`rename`, no copy-then-delete)

## Adversarial Test Review

### Summary
Tests are mostly strong: real `fs/promises` against `mkdtemp` dirs,
zero mocks, integration tests drive the actual `dist/cycle.js`
subprocess. Two weaknesses: the `propagateBlocked` call is verified by
proxy (the `queue.drained outcome:terminal` event) instead of by spy
or direct log marker per SPEC; and the build-race issue above is itself
a test-infrastructure defect.

### Findings
1. **`propagateBlocked` assertion is indirect**: SPEC acceptance
   criterion requires spy/stub verification of the call. The terminal
   test at `tests/cli/queue-drain.test.ts:100-128` only checks the
   `queue.drained outcome:terminal` event, which is emitted regardless
   of whether `propagateBlocked` is awaited. A regression that drops
   the call would not trip the test.
2. **No coverage of terminal-failure malformed-frontmatter path**:
   ties directly to code finding #2. No test asserts what happens when
   `mutateFrontmatter` throws during terminal failure. Currently the
   file is silently orphaned and no test would catch it.
3. **No test for retry path NOT mutating frontmatter**: retry branch
   in `src/cli.ts:119-124` correctly skips frontmatter mutation, but
   no assertion pins that the todo body is unchanged after retry.
   Defensive but reasonable to add.
4. **`tests/engine/scan.test.ts` `mkBody` always sets `added_at`**:
   `scanRaw` does `String(fm.added_at ?? "")` — the empty-string
   fallback path is not exercised. Minor.
5. **Missing test for `popNextPending` ordering when only the first
   row is `in_progress`**: covered indirectly by the FIFO test
   (`tests/engine/queue.test.ts:156-169`), but no test confirms that
   if the first row is `in_progress` AND the second is also
   `in_progress`, the third (`pending`) is returned. Edge case.
6. **`tests/engine/frontmatter.test.ts:68-82` idempotence test uses
   trivial value `k:"v"`**: doesn't exercise idempotence with a
   quote-needing value (e.g. `failed_at: "2026-..."` — the failure
   case). Likely OK because serializer is deterministic, but spec
   requires preserving body bytes and only quote-needing values trigger
   the quoting path.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.60 / 86.40 / 94.52**
- Regressions vs base (per-file):
  - `src/engine/scan.ts`: 96.08 / 75.00 / 100.00 (modified — was lower
    before; no regression vs `CLAUDE.md` baseline)
  - `src/engine/run-cycle.ts`: 97.83 / 78.26 / 83.33 (modified — within
    baseline)
  - New: `blocked.ts` 100/100/100, `frontmatter.ts` 100/87.88/100,
    `queue.ts` 97.11/88.16/100 (all clear thresholds)
  - **`src/cli.ts` is NOT measured** by the coverage tool because it
    runs as a subprocess (`node dist/cycle.js`) in integration tests
    rather than as an imported module. This is pre-existing behavior,
    not a BB-3 regression — but it means significant new drain logic
    in `cli.ts:77-145` has no per-file coverage visibility. Note for a
    future cycle: refactor drainable state into a unit-testable
    `src/engine/drain.ts` to surface it.
- New code without tests: none (all branches in `queue.ts`,
  `frontmatter.ts`, `blocked.ts` reached; integration suite covers
  drain branches in `cli.ts` end-to-end).
- Specific scenarios missing tests:
  - terminal failure with malformed/missing frontmatter on todo file
  - explicit `propagateBlocked` invocation assertion
  - retry path preserves todo body byte-for-byte
  - `max_cycle_attempts: 0` / negative (clamp path)
  - `scanRaw` with `added_at` missing in frontmatter
```

Wrote `MUST-FIX.md` to `docs/cycle/0014-feature-bb-3-new-tbd-jsonl-row-schema-and-drain/` with 2 critical tasks (build-race in coverage, orphan-on-mutate-throw) and 3 minor cleanups. Verdict NEEDS-FIX — fix step should land Tasks 1 and 2 at minimum.
