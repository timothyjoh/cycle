Now print REVIEW to stdout for engine capture.

```markdown
# Review: Cycle 0023

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (one critical issue: dry-run retry-budget
semantics deviate from PLAN and silently break the canonical
post-`engine.paused` recovery flow).

## Code Quality Review

### Summary
Implementation matches PLAN structure cleanly: per-raw retry loop
extracted into `processRawWithRetry` with a `ProcessCtx` callback
shape, `runTriage` keeps byte-identical event/disk semantics via
`onAttemptFailed` + `apply` callbacks, and `dryRunTriage` reuses the
helper without mutators. CLI handler in `src/cli/triage.ts` is small,
pure, and follows the `status.ts` shape. CLAUDE.md updated. The only
substantive bug is `attempts` counter reuse across runTriage and
dryRunTriage modes (see MUST-FIX Task 1).

### Findings
1. **Correctness (Critical)**: `processRawWithRetry` starts the
   retry loop at `attempt = raw.attempts` for both runTriage and
   dryRunTriage. PLAN §Task 2 Notes explicitly required dry-run to
   count from 0 and ignore on-disk `triage_attempts`. The
   post-`engine.paused` re-triage flow (the SPEC's stated trigger)
   produces raws with `triage_attempts: 3`; dry-run then runs 0
   agent invocations and returns `{status: "failed", attempts: 0,
   last_error: ""}` — silently useless. — `src/engine/triage.ts:81`
   and `src/engine/triage.ts:262-285`.

2. **Minor**: `dryRunTriage` returns `last_error: ""` when the helper
   runs zero loop iterations (consequence of Finding 1). With
   Finding 1 fixed, zero-iteration runs can't happen for normal
   inputs, and this becomes moot. — `src/engine/triage.ts:295`.

3. **Minor — deviation noted in BUILD**: `runCliTriage` gained an
   optional `deps: TriageDeps = {}` parameter (PLAN signature was
   `(repoRoot, argv)` only). Justification (unit-test injection w/o
   subprocess) is acceptable, but the extra surface is leaked
   through `cli.ts` only as `argv.slice(1)` — the deps stay `{}` in
   production. Fine, but worth flagging: a future change that
   threads real deps from `cli.ts` now has a path to plumb mocks
   accidentally. — `src/cli/triage.ts:22-26`.

4. **Style**: `ParsedTriageOutput` is a type alias for `TriageOutput`
   in the same file (`src/engine/triage.ts:65`). Either inline or
   delete the alias — it adds a name without a meaning shift.

### Spec Compliance Checklist
SPEC.md is blank in the cycle dir, so this checklist is derived from
PLAN.md §Desired End State and CLAUDE.md's `cycle triage --dry-run`
row.

- [x] `cycle triage --dry-run` prints `Array<{raw_id, status,
      attempts, last_error?, children?}>` as 2-space-indent JSON.
- [x] Exit 0 if every raw passes validation, 1 otherwise.
- [x] `cycle triage --help` prints the no-side-effects contract,
      exits 0.
- [x] `cycle triage` (no flag) prints help on stderr, exits 2.
- [x] No engine-side writes to `raw/`, `todo/`, `done/`, `failed/`,
      `.cycle/tbd.jsonl`, `.cycle/log.jsonl` (asserted by both unit
      and E2E byte-identity tests).
- [x] `runTriage` event/disk sequence preserved (per-attempt
      `bumpAttempts` + `triage.raw.failed` retained via
      `onAttemptFailed`).
- [x] CLAUDE.md Commands table updated.
- [ ] `attempts` field semantics match PLAN ("starts from 0 each
      run; on-disk `triage_attempts` not consulted"). **Fails for
      raws with `triage_attempts > 0`** — see MUST-FIX Task 1.

## Adversarial Test Review

### Summary
Strong overall: real filesystem + real validator + only the agent
boundary mocked. Byte-identity covered at both unit and E2E levels.
The one gap is structural — every dry-run fixture seeds raws with
`triage_attempts: 0`, which is exactly the parameter value that hides
the Finding 1 bug. Tests pass; behavior is wrong.

### Findings
1. **Missing coverage of a specified contract**: no test exercises
   `dryRunTriage` against a raw with `triage_attempts > 0`. PLAN
   pinned the semantics ("starts from 0 each run") and the SPEC use
   case demands it (re-running raws that were previously moved to
   `failed/` with attempts=3). — `tests/engine/triage-dry-run.test.ts`
   throughout; suggested regression test in MUST-FIX Task 1 Verify.

2. **Minor — boundary-test deviation, intentional**: the dry-run unit
   test's `rawBody` helper accepts an `attempts` parameter (line 51),
   but every call site passes the default 0. Either delete the
   parameter (it's unused) or use it to wire Finding 1's missing
   case.

3. **Minor — agent-throws path not unit-tested for dry-run**: the
   helper's `try/catch` around `runAgent` (`src/engine/triage.ts:99`)
   is covered for `runTriage` (existing
   `tests/engine/triage.test.ts` "agent that throws…" case) but the
   `dryRunTriage` codepath through the same line is only reached via
   shared coverage. A direct dry-run test with
   `runAgent: async () => { throw new Error("…") }` would pin the
   `lastError: "agent failed: …"` shape into the dry-run report. Low
   stakes — current shared coverage is enough — but worth adding
   if a fix touches the helper.

4. **Test independence — clean**: each test uses `mkdtemp` + `rm`
   teardown via `try/finally`. No shared state, no ordering
   dependencies. Good.

5. **Mock surface — clean**: only `deps.runAgent` is stubbed. Every
   other path (filesystem, validator, queue read, config load) runs
   for real. No mock-the-mock issues.

6. **Assertion quality**: assertions are specific (`equal`,
   `deepEqual`, `match` with concrete regex on
   `/not valid JSON/i`, `/agent exited 1/`). E2E byte-identity uses
   sha256 + explicit size comparison. Strong.

7. **E2E fake-claude script**: `fakeClaudeOk` uses `grep -oE` to
   parse the raw id from the prompt then heredocs JSON. Functional
   but fragile against future changes to the prompt template's
   `=== raw: <id> ===` marker. Not actionable today — fragility
   would surface as a CI failure, not a silent miscompare.

### Test Coverage
- Command run: `npm run test:coverage`
- All-files line / branch / function: **97.14 / 90.64 / 96.21**
  (baseline 95 / 75 / 90 — all above).
- Regressions vs prior cycle baseline (cycle 0022 trailing numbers
  in BUILD.md): **none**. Per-file `src/engine/triage.ts` is **94.88
  / 94.44 / 97.50** (was 93.64 / 91.95 / 97.06 — net improvement on
  all three). `src/cli/triage.ts` is **100 / 100 / 100**.
- New code without tests: none — every new branch in
  `dryRunTriage`, `runCliTriage`, and `processRawWithRetry` is
  exercised. Uncovered lines reported on `src/engine/triage.ts`
  (607-668, 698-722) are the legacy `runClaudecodeAgent` spawn body
  and `applyRaw`/`moveToFailed` write paths, both pre-existing.
- Specific scenarios missing tests:
  1. Dry-run against a raw with `triage_attempts > 0` (Finding 1
     above; ties to MUST-FIX Task 1).
  2. Dry-run path where `runAgent` throws (Finding 3 above).
  3. Dry-run when the prompt template file is missing — current
     code lets the `readFile` error propagate; behavior is
     reasonable but undocumented.

MUST-FIX.md captures the critical issue.
