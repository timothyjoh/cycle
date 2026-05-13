Now emit REVIEW.md content to stdout.

```markdown
# Review: Cycle 0015

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md. Core implementation is solid (168/168 tests
pass, coverage 96.25 / 88.32 / 94.06 above 95/75/90 baseline), but the
integration test misses three SPEC-mandated acceptance assertions
(tbd.jsonl ordering, run exit code, todo frontmatter) and the
per-raw-vs-batch design deviation from SPEC is undocumented.

## Code Quality Review

### Summary
`src/engine/triage.ts` is clean, type-safe, and atomic where it counts.
Rollback semantics match PLAN; validator is exhaustive; logging is
structured. Main concern: implementation invokes the agent once per
raw instead of once per pass with all raws, contradicting SPEC's
"single rendered input block" phrasing. Coverage gaps in `triage.ts`
(lines 209-210, 229-230, 485-496, 516-517, 531-532, 536-537, 567-591)
are best-effort try/catch + the default subprocess runner — acceptable.

### Findings
1. **SPEC deviation — per-raw vs. batch agent invocation** —
   `src/engine/triage.ts:102,114`. Each raw triggers an independent agent
   call with `[raw]` in `{{RAWS_BLOCK}}`. SPEC §Requirements says the
   prompt should carry "raw bodies" (plural) as "a single rendered input
   block". PLAN explicitly chose per-raw; BUILD followed PLAN; SPEC was
   silently overridden. Forecloses cross-raw decomposition and shared-
   dependency reasoning in one pass. See MUST-FIX Task 4.
2. **Last-ordering-wins** — `src/engine/triage.ts:100,170,188-190`.
   `lastOrdering` is overwritten each successful raw; earlier raws'
   `ordering[]` is discarded. Correctness is preserved by the
   `ordering_omitted` warning + tail-append in `rewriteOrdering`, but
   agent intent is lost. Coupled with finding 1.
3. **`atomicWrite` leaks `.tmp` files on rename failure** —
   `src/engine/triage.ts:502-507`. No catch on the rename; tmp lingers.
   Real footgun if `rename` fails for any reason other than the
   pathological chmod cases the tests cover.
4. **Redundant `loadConfig` per loop iteration** — `src/cli.ts:101`.
   Hot path re-parses YAML when `raw/` has files. Lift to a single
   load at startup.
5. **CLAUDE.md updated correctly** — `CLAUDE.md:38` adds the triage
   subroutine line; the (mythical) "scanRaw reference" PLAN claimed
   to drop never existed in the prior file. No action needed there.

### Spec Compliance Checklist
- [x] `src/engine/triage.ts` and `src/defaults/prompts/triage.md` exist;
  `.cycle/prompts/triage.md` is synced.
- [x] `cli.ts` calls triage at engine.start and at the top of the pop
  loop when `raw/` non-empty (`src/cli.ts:60,100`).
- [x] `scanRaw` deleted; `src/engine/scan.ts` and
  `tests/engine/scan.test.ts` removed.
- [x] `--dry-run` skips triage (`src/cli.ts:60` guards with
  `if (!args.dryRun)`).
- [x] Schema validator rejects every required field with a specific
  message (22 cases in `tests/engine/triage-validator.test.ts`).
- [x] 3-attempt exhaustion moves raw → `failed/` with
  `triage_attempts: 3` + `failed_at` + `failed_step: "triage"`
  (`src/engine/triage.ts:520-538`, asserted in
  `tests/engine/triage.test.ts:438-485`).
- [x] Whole-pass failure emits `engine.paused` + exits non-zero
  (`src/engine/triage.ts:192-195`, `src/cli.ts:64-70`).
- [x] Atomic per-raw apply with rollback
  (`src/engine/triage.ts:432-499`).
- [x] Coverage holds the master baseline.
- [ ] **"passes raw bodies … as a single rendered input block"** —
  implementation does per-raw invocation. See finding 1 / MUST-FIX
  Task 4.
- [ ] **Integration test asserts `tbd.jsonl` has both rows in agreed
  ordering** — missing (`tests/cli/triage.test.ts:84-122`). See
  MUST-FIX Task 1.
- [ ] **Integration test asserts todo files have correct frontmatter** —
  missing. See MUST-FIX Task 3.

## Adversarial Test Review

### Summary
Strong. Tests use real fs (`mkdtemp`), real frontmatter, real queue
primitives; only the `runAgent` boundary is mocked via `deps.runAgent`.
Validator coverage is exhaustive (22 negative cases + 1 positive).
Rollback paths exercised by chmod-driven failure injection on both
`tbd.jsonl` and `done/`. Retry-budget persistence across runs is
tested (`tests/engine/triage.test.ts:647-672`). Failure-cause
discrimination is tested (`stderr`-bearing exit codes, agent throws,
JSON parse failures). The unit/validator suites are model behavior.

The integration test is the weak link: spawned `run` is fire-and-forget,
no exit code assertion, no `tbd.jsonl` parse, no frontmatter parse.
Three SPEC-required assertions absent.

### Findings
1. **Integration test discards `spawnSync` result** —
   `tests/cli/triage.test.ts:84`. Cannot detect run crashes. See
   MUST-FIX Task 2.
2. **Integration test doesn't read `tbd.jsonl`** —
   `tests/cli/triage.test.ts:116-122`. SPEC §Acceptance explicit.
   See MUST-FIX Task 1.
3. **Integration test doesn't parse frontmatter** —
   `tests/cli/triage.test.ts:91-122`. Asserts file presence at most;
   frontmatter never inspected. See MUST-FIX Task 3.
4. **Validator failure → retry test only checks string substring of
   field name in second prompt** —
   `tests/engine/triage.test.ts:425-428`. Asserts the literal token
   `"depends_on"` appears in the next-attempt prompt rather than the
   full validator error string. Adequate but weaker than asserting the
   structured reason (`children[0].depends_on: expected array, got
   undefined`). Minor.
5. **`tests/engine/triage.test.ts:545` "atomic apply rolls back when
   appendRow fails" creates a chmod'd-0o400 `tbd.jsonl` then exhausts
   3 attempts** — the test asserts final state (`paused`, `failed/`)
   but doesn't isolate that the **first** apply attempt rolled back
   cleanly (todo absence checked post-3-attempts, which conflates
   roll-back with moveToFailed cleanup). The rollback-cleanliness
   invariant could regress without this test catching it. Minor.
6. **No test for partial child rollback within one raw** —
   `applyRaw` writes child A's todo + queue row, then child B fails
   appendRow → catch unlinks both A and B todos and filters both ids
   from queue. Test 10 (`tests/engine/triage.test.ts:588-630`) covers
   the renameRaw failure (after both children land) but no test
   exercises the mid-children failure path. Minor.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 96.25 / 88.32 / 94.06 (overall)
- `triage.ts` standalone: 93.40 / 92.25 / 93.55
- Regressions vs baseline (per-file):
  - `run-cycle.ts` line 97.83 (was 100.00 on master) — net -2.17.
    Uncovered lines 59-60 belong to the new `cycle.start` workflow
    fallback path. Acceptable: still above baseline, root-cause is
    the BB-3 fallback wiring not new BB-4 code.
  - `queue.ts` line 95.95 (was 100.00) — net -4.05. Uncovered lines
    are the `appendRow` ENOENT-mkdir fallback exercised only when
    `.cycle/` is missing; not new in BB-4.
- New code without tests:
  - `runClaudecodeAgent` (`triage.ts:567-591`) — the actual
    subprocess implementation is exercised only by the integration
    test, which doesn't assert on its outputs (Tasks 1-3 fix this).
  - `bumpAttempts`/`moveToFailed` swallowed-error branches
    (`triage.ts:516-517,531-532,536-537`) — best-effort try/catch;
    untestable without injecting a Frontmatter mutation failure.
    Acceptable.
- Specific scenarios missing tests:
  - Partial-child rollback within a single raw (finding 6).
  - `.tmp` file cleanup on rename failure (MUST-FIX Task 5 adds it).
  - Integration test on `tbd.jsonl` content + exit code (MUST-FIX
    Tasks 1-3).
```

MUST-FIX written. 6 tasks, 3 critical (integration-test gaps that miss SPEC acceptance items) + 3 minor (design-deviation doc, `.tmp` leak, redundant `loadConfig`).
