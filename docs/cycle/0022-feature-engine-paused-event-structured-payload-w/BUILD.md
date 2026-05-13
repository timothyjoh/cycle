Coverage: all files line 96.73% / branch 89.53% / func 95.97% — all above baseline. `triage.ts` line coverage 93.64% (up from 93.5% baseline) — net positive, no regression.

```
Cycle 0022 build complete.

Files modified:
- src/engine/triage.ts (+18 lines, -2): added `lastErrors: string[]` accumulator at line 100 (index-aligned with `failed`), appended `lastErrors.push(lastError)` inside the existing `if (!succeeded)` block at line 194, and replaced the single `engine.paused` emission at lines 203-217 with the structured payload `{ reason: "all_triage_failed", raw_ids, last_errors }` plus an inline `truncate(s)` helper that slices at 1999 chars and appends `…` when length > 2000. `TriageResult` shape unchanged.
- tests/engine/triage.test.ts (+135 lines, -1): updated the existing whole-pass-failure test (now asserts `reason: "all_triage_failed"`, `raw_ids`, `last_errors` shape/length/raw_id/error-type/non-empty, and `"failed" in fields === false`); added three new tests covering (a) two-raw order invariant with distinct `BAD-A-OUT` / `BAD-B-OUT` stderr-derived errors, (b) truncation when `lastError` exceeds 2000 chars (asserts `.length ≤ 2000`, `.endsWith("…")`, `.startsWith("agent exited 1: X")`), (c) boundary length exactly 2000 via the agent-throw path with a precisely-sized payload (asserts `.length === 2000`, no `…` suffix).
- CLAUDE.md (+1 line, -1): "Triage subroutine" bullet updated to document the new `engine.paused` payload contract (`reason: "all_triage_failed"`, `raw_ids`, `last_errors`) and the 2000-char head-kept truncation rule.

PLAN.md task status:
- Task 1 (collect per-raw errors, enrich payload, drop `failed` field): complete.
- Task 2 (update existing assertion + three new tests for ordering, truncation, boundary): complete.
- Task 3 (CLAUDE.md "Triage subroutine" sentence): complete.

Verification:
- `npm run typecheck`: clean, no errors.
- `npm test`: 266 / 266 pass (`tests 266 | pass 266 | fail 0`).
- `npm run test:coverage`: 266 / 266 pass. All-files coverage: line 96.73% (≥95%), branch 89.53% (≥75%), func 95.97% (≥90%). `triage.ts` line coverage 93.64% (was 93.5% per refl-0021 baseline); branch 91.95%; func 97.06% — net positive on the file, no per-file regression. No file regressed vs master baseline.

Deviations from PLAN.md:
- Dropped the `failed` payload field on `engine.paused` (no alias) per PLAN §Resolved Open Questions, with the test asserting `"failed" in fields === false` to lock the choice in. RESEARCH confirmed zero external readers of the old field, so an alias would be dead noise.
- The boundary-2000-no-truncation test uses the agent-throw path (`agent failed: <Error.message>`) instead of the validator path, because the agent-throw path produces a deterministic, precisely-sized error string (`prefix.length + payload.length`) — the validator-derived JSON-parse error message depends on `JSON.parse`'s implementation-defined snippet, which would make a 2000-byte boundary fragile across Node versions. Same code branch in `truncate` is exercised.
- Kept the `lastErrors[i] ?? ""` defensive default at the emit site (PLAN §Notes flagged this as belt-and-suspenders). Coverage did not slip on the branch, so no removal needed.

Deferred / follow-up:
- The broader `triage.ts` line-coverage uplift to ≥95% remains owned by reflection issue `refl-0021-triage-ts-per-file-line-coverage-93-5-be` (already triaged into todo). This cycle nudged it from 93.5% → 93.64% but did not target the uncovered ranges (`233-234`, `253-254`, `530-531`, `540-541`, `557-558`, `570-571`, `585-586`, `590-591`, `621-645` — mostly `loadRaws`/`bumpAttempts`/`moveToFailed`/`atomicWrite` defensive `catch` branches and the `runClaudecodeAgent` real-spawn function).
- No CLI surfacing of paused state; no `cycle status` integration. Both are tracked under sibling issues (`engine-paused-recovery-dry-run`, `engine-paused-recovery-docs`).
```
