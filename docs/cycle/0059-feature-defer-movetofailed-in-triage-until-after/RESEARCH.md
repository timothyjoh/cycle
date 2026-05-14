Research dump to stdout below. SPEC.md is degenerate (124 bytes of agent narration); authoritative requirements live in the issue file `refl-0024-defer-movetofailed-until-after-all-triag`.

```markdown
# Research: Cycle 0059

## Cycle Context

This cycle defers `moveToFailed` (raw → `failed/` rename) in `src/engine/triage.ts` until after the whole-pass `all_triage_failed` check. On the all-fail path, raws stay in `raw/` so `cycle triage --dry-run` can re-evaluate them without operator `mv` shuffling. Partial-failure path (≥1 raw decomposed cleanly) preserves today's behavior: failed raws still land in `failed/` with `failed_step: "triage"`. SPEC.md emitted for this cycle is degenerate (124 B narration leak); authoritative requirements are in `docs/cycle/issues/todo/refl-0024-defer-movetofailed-until-after-all-triag.md`.

## Current Codebase State

### Relevant Components

- **Triage engine — `runTriage`**: orchestrates per-raw retry, then whole-pass classification. Calls `moveToFailed` *inside* the per-raw failure branch (the bug surface) — `src/engine/triage.ts:190-221`.
- **Per-raw failure branch (today)** — currently bundles three actions: push id into `failed[]`, push error into `lastErrors[]`, call `moveToFailed(repoRoot, raw)` — `src/engine/triage.ts:216-220`.
- **Whole-pass all-fail classification**: runs *after* the per-raw loop. Emits `engine.paused {reason:"all_triage_failed", raw_ids, last_errors}`. Today, the rename has already happened by the time this branch runs — `src/engine/triage.ts:227-242`.
- **`moveToFailed` helper**: stamps `triage_attempts: MAX_ATTEMPTS`, `failed_at`, `failed_step: "triage"` on the raw's frontmatter, then renames `raw/<id>.md → failed/<id>.md`. Both inner ops are individually try/catch-swallowed — `src/engine/triage.ts:652-670`.
- **`bumpAttempts` helper**: per-attempt frontmatter mutation. Lives on a different code path from `moveToFailed`; must continue firing on every attempt on both all-fail and partial paths — `src/engine/triage.ts:641-650`.
- **`processRawWithRetry`**: drives the 3-attempt budget per raw, emits `triage.raw.failed` per attempt via `onAttemptFailed` callback. Unchanged by this cycle — `src/engine/triage.ts:88-153`.
- **`rewriteOrdering`** runs after the per-raw loop on success. Failed raws don't contribute to ordering — `src/engine/triage.ts:223-225`, `:672-697`.
- **CLI surfacing**: `src/cli.ts:91-99` calls `runTriage` and maps `result.status === "paused"` to `haltReason = "triage_failed"` plus an `engine.halted` emit. Already terminates non-zero. No file-system side effects in CLI layer related to the rename. The `result` shape (`{status, processed, failed}`) is consumed at this single call site.

### Existing Patterns to Follow

- **Per-attempt vs. per-raw terminal hooks**: `processRawWithRetry` already separates "per attempt" effects (via `onAttemptFailed`) from "per raw terminal" effects (the caller's branch on `outcome.status`). The cycle's split — keep `bumpAttempts` + `triage.raw.failed` per attempt, defer `moveToFailed` per raw — fits this seam without changing `processRawWithRetry`'s signature.
- **Two-pass commit pattern**: `applyRaw` (`src/engine/triage.ts:555-623`) already shows the "collect intent, then commit / rollback" shape — pushes into `appliedTodos[]` / `appliedIds[]` and either keeps them or unwinds in a single catch. The deferred-rename refactor can follow the same shape: collect `RawIssue[]` into a `failedRaws[]` list during the loop, then call `moveToFailed` on each only in the partial-failure post-branch.
- **Order-stable failed bookkeeping**: existing code keeps `failed[]` and `lastErrors[]` index-aligned (`:217-218`, `:231-235`). When deferring the rename, the same index-alignment invariant should hold for `failedRaws[]` (or a `Map<rawId, RawIssue>`).
- **Best-effort I/O inside `moveToFailed`**: both inner ops are already individually wrapped; partial flush of the deferred list should preserve the same per-call resilience (one rename failing must not abort the rest).
- **Per-raw test isolation**: every test in `tests/engine/triage.test.ts` builds an isolated tmp repo via `setupRepo()` (`:49-62`) and tears down. Same harness already exercises both partial-fail (`tests/engine/triage.test.ts:438-485`) and whole-pass-fail (`:487-534`) paths — new tests should drop into this same file beside them.

### Dependencies & Integration Points

- **Frontmatter mutation**: `mutateFrontmatter` from `src/engine/frontmatter.ts` is called both from `bumpAttempts` and from `moveToFailed`'s stamp pass. Tests at `tests/engine/triage.faults.test.ts:134-216` exercise both swallow paths today.
- **Queue (`tbd.jsonl`)**: `runTriage` never appends/rewrites queue rows on the failure path — `tbd.jsonl` integrity is unaffected by the rename location. Confirmed at `src/engine/triage.ts:216-220` (failure branch touches no queue state).
- **Log emission**: `triage.raw.failed` (per attempt) and `engine.paused` (whole-pass) are the only events on the failure path. Neither references the rename. Test invariant at `tests/engine/triage.test.ts:480-484` (no `engine.paused` on partial fail) and `:503-509` (exactly one `engine.paused` on whole-fail) both stand regardless of where the rename happens.
- **CLI dry-run consumer**: `dryRunTriage` (`src/engine/triage.ts:251-307`) reuses `processRawWithRetry` but never calls `moveToFailed`. It already scans `raw/` only (`:257-258`). After this cycle's change, the all-fail path will leave the raw files where `dryRunTriage` already looks for them — that's the "edit → dry-run → re-fire" loop the issue calls out.

### Test Infrastructure

- **Framework**: Node native test runner via `node --experimental-strip-types` (`npm test` → `dist/cycle.js` rebuild via `pretest` → tests). Spec reporter.
- **Coverage**: `npm run test:coverage` runs `--experimental-test-coverage`, emits LCOV at `.cycle/coverage.lcov`, then `posttest:coverage` runs `scripts/coverage-gate.mjs` enforcing per-file `src/engine/triage.ts ≥ 95%` line floor and the global ≥ 95% / 75% / 90% line/branch/function floors.
- **Test files for triage**:
  - `tests/engine/triage.test.ts` — happy paths, retries, exhaustion, whole-pass-fail, atomic rollback, dispatch. 1304 lines.
  - `tests/engine/triage.faults.test.ts` — fault-injection tests for `bumpAttempts`, `moveToFailed` stamp-pass, `moveToFailed` rename, `rewriteOrdering`. 461 lines. The three tests at `:90-251` explicitly cover the `moveToFailed` paths and assume `failed/<id>.md` exists post-pause.
  - `tests/engine/triage-validator.test.ts` — pure validator unit tests. Independent of failure-path move logic.
  - `tests/engine/triage-dry-run.test.ts` — dry-run report shape. Independent of move logic.
  - `tests/cli/triage-dry-run.test.ts`, `tests/cli/triage.test.ts`, `tests/cli/triage-handler.test.ts` — CLI surface; the dry-run handler is the integration entry point operators hit after a pause.
- **Existing tests that will break under naive defer**:
  - `tests/engine/triage.test.ts:487-534` ("whole-pass failure: only raw fails all attempts → engine.paused") asserts `failedFiles ≡ ["only.md"]` and `triage_attempts === 3`. Under the new behavior the raw stays in `raw/` on the all-fail path; this test needs updating to match.
  - `tests/engine/triage.faults.test.ts:90-130` ("agent rejection across full retry budget moves raw to failed/") triggers an all-fail scenario (single raw, all attempts fail). It currently asserts `failedFiles ≡ ["agentfail.md"]` — must move to asserting raw remained in `raw/`.
  - `tests/engine/triage.faults.test.ts:134-173` (`bumpfail`) — single raw, all-fail path, asserts `failed/bumpfail.md` exists. Needs realignment.
  - `tests/engine/triage.faults.test.ts:177-216` (`stampfail`) — single raw, all-fail path, asserts `failed/stampfail.md` exists. Needs realignment.
  - `tests/engine/triage.faults.test.ts:220-251` (`vanish`) — single raw, all-fail path. Already asserts `failed/vanish.md` is absent (because the rename was swallowed). Under the new behavior the raw is gone from `raw/` (unlinked by the test) and never reaches `failed/` regardless; assertion likely still holds, but the rationale text in the test belongs updated.
  - `tests/engine/triage.test.ts:438-485` ("3-attempt exhaustion: one raw fails all attempts, other succeeds") is the partial-failure test — assertions (`failedDir ≡ ["A.md"]`, `failed_step === "triage"`, `failed_at` populated) MUST continue to pass unchanged after this cycle.

### Affected Documentation

- `README.md:139` — describes the all-fail outcome as "moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped". Must reflect that all-fail leaves raws in `raw/`.
- `README.md:161-167` — operator instructions describe `ls docs/cycle/issues/failed/` to find the moved raws. Update to point at `raw/`.
- `README.md:177-183` — explicit `mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md` recovery step. Drop this step.
- `README.md:198-201` — "Edit `docs/cycle/issues/failed/<id>.md`" instruction. Path becomes `raw/`.
- `README.md:209` — "the only on-disk side effects are the raw files moved from `raw/` to `failed/`". Update: only the `engine.paused` log line (and preceding `triage.raw.failed` events) plus per-attempt `triage_attempts` bumps on the raw frontmatter.
- `docs/RFC-001-issue-lifecycle.md:223-227` — §5 "Triage failure handling". Lines 223-225 describe the partial-failure rename (correct, stays). Line 227 (all-fail emit) needs amendment that no move happens.
- `CLAUDE.md:68` — Architecture quick-reference triage paragraph. Lists `engine.paused` payload but does not currently mention the rename; double-check phrasing for the all-fail vs. partial-fail distinction and add the new contract if the existing wording could mislead.

## Code References

- `src/engine/triage.ts:155-249` — `runTriage` body.
- `src/engine/triage.ts:190-221` — per-raw loop; `:216-220` is the failure branch where `moveToFailed` currently lives.
- `src/engine/triage.ts:227-242` — `failed.length === raws.length` whole-pass check + `engine.paused` emit + `paused` return.
- `src/engine/triage.ts:244-248` — `triage.end` emit + `ok` return (partial-fail or all-success).
- `src/engine/triage.ts:641-650` — `bumpAttempts` (untouched).
- `src/engine/triage.ts:652-670` — `moveToFailed` (deferred caller, not the helper itself).
- `src/engine/triage.ts:251-307` — `dryRunTriage` (consumer of the new "raws stay in `raw/`" invariant).
- `src/cli.ts:91-99` — CLI handling of `runTriage` paused result.
- `tests/engine/triage.test.ts:487-534` — primary all-fail integration test; will require updated assertions.
- `tests/engine/triage.test.ts:438-485` — partial-fail test; assertions must remain green.
- `tests/engine/triage.faults.test.ts:90-251` — `moveToFailed`-path fault tests; three of four are single-raw all-fail and require realignment.
- `README.md:137-209` — "Recovering from engine.paused" section.
- `docs/RFC-001-issue-lifecycle.md:221-227` — §5 "Triage failure handling".

## Open Questions

- **Decomposed_parents not stamped on failure today**: today's `moveToFailed` also stamps `triage_attempts: MAX_ATTEMPTS`. On the all-fail path, raws stay in `raw/` — what's the new contract for the on-disk `triage_attempts` value on those raws? `bumpAttempts` runs per attempt and persists incrementally (today's `bumpfail` test at `tests/engine/triage.faults.test.ts:134-173` shows the counter ends at the bumped attempt count, e.g. `2`, when the inner mutate fails — but the normal path advances it to `3` via the same loop). Plan should pin whether the new all-fail path relies solely on the per-attempt `bumpAttempts` (so `triage_attempts` ends at `3` organically) or also stamps `failed_at` / `failed_step` on the all-fail raws even though they remain in `raw/`. SPEC says "Frontmatter `bumpAttempts` and per-attempt `triage.raw.failed` log events still emitted on every attempt on both paths" — but is silent on `failed_at` / `failed_step` for the all-fail raws.
- **`dryRunTriage` retry budget on re-fire**: `dryRunTriage` clones each raw with `attempts: 0` (`src/engine/triage.ts:280`), so a fresh re-attempt always gets the full 3-attempt budget regardless of persisted `triage_attempts`. The real engine re-fire path (the `cycle` command, not `--dry-run`) loads `triage_attempts` from frontmatter at `:322-323`. If `triage_attempts` reaches `3` on raws still in `raw/`, the next real engine invocation will immediately re-pause without invoking the agent. Plan should confirm whether this is intended (operator must edit-and-reset) or whether `bumpAttempts` should be capped / reset on the all-fail path.
- **Cycle 0058 spec-guard interaction**: cycle 0058 added a SPEC.md byte-floor guard. The current cycle's SPEC.md is 124 bytes (< 200 threshold) yet `step.end status:"ok"` was emitted for the spec step in `.cycle/log.jsonl`. Not in scope for this cycle, but the planner should be aware that the SPEC.md they're working from is a narration leak, not the authoritative spec — the issue file is.
- **Dogfood vs. shipped workflow divergence**: `.cycle/workflows.yml` runs `no_branch:true`. The cycle does not touch branch logic, so this is documentation-only. Plan should note the change is workflow-agnostic.
```

End of research dump. Caveman caveat: spec degenerate, used issue file as ground truth. Plan step must decide `triage_attempts` / `failed_at` stamp policy on raws that remain in `raw/`.
