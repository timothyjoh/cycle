# SPEC — Cycle 0272: Degenerate verification blocks — a zero-execution test run is unverified, not green

## WHY
The engine trusts the `verify` step's exit code alone. A test run that exits 0 **only because every meaningful test skipped** is treated as success and drains the issue to `done/ ok`. This directly violates the Core thesis (`BRIEF.md`): "Verification that is skipped, degraded, or stubbed is not verification, and a false green is a failure." Live evidence: e2e specs guard themselves with `test.skip(...)` when required env (`INSTANT_ADMIN_TOKEN` / `PUBLIC_INSTANTDB_APP_ID`) is unset; a run where the entire suite skips still exits 0. The app's behavior was never asserted, yet the cycle reports working software. Today there is no mechanism that distinguishes "the tests ran and passed" from "no test ran at all."

## CONCRETE USER BENEFIT
An operator running `cycle run` can trust a `done/ ok` outcome to mean tests actually executed. When a verify step exits green having run **zero** non-skipped tests, the cycle now blocks with a loud, specific diagnostic (`verification incomplete: N tests skipped, 0 executed — cannot confirm the app works`) instead of silently parking the issue in `done/`. The operator observes a failed/blocked cycle and a `verify.unverified` log event they can grep for — the false green is gone.

## USABLE END-STATE
After this cycle, when a `verify` (or `final_verify`) bash step exits 0 but its test-runner output reports zero executed tests alongside one or more skips/total, the engine treats the step as **failed** (routed through the existing step-failure path), emits a structured `verify.unverified` event with the parsed counts and reason, and prints the diagnostic to stderr. A run that executed real tests with a few legitimate skips still passes. Output the engine cannot parse degrades to today's exit-code-only behavior — no regression, no false block.

## Objective
Teach the engine to recognize a **degenerate verification** — a green test run that executed zero non-skipped tests — and route it through the normal step-failure path as unverified, rather than passing. This cycle delivers the agnostic, universal slice of the no-false-greens thesis: the zero-executed rule, defensively parsed from common reporters, fail-closed when a degenerate run is detected and fail-open (unchanged) when output is unparseable.

## Source Issue
`fix-no-false-greens-unverified-blocks` — "No false greens: a skipped/degenerate verification run must block, not pass"

## Scope

### In Scope
- A defensive test-output parser (new `src/engine/verify-counts.ts`) that extracts `{ executed, skipped, total }` from common reporter summaries (vitest/jest `Tests: N passed, M skipped`, node:test `# tests`/`# pass`/`# skip`, pytest `N passed, M skipped`, cargo `test result: ... N passed; M ignored`), returning `null` when no recognized summary is found.
- A run-cycle hook: after a bash step named `verify` or `final_verify` exits 0, parse its captured stdout; when the parse yields a non-null result whose `executed === 0` **and** (`skipped > 0` or `total > 0`), set `r.status = "failed"`, emit `verify.unverified { cycle_id, step, executed, skipped, total, reason }`, and surface the diagnostic via the step's `stderr` so it routes through the unchanged terminal/retry path.
- An engine config knob `engine.verify_min_executed` (default `1`, fail-closed; absent/non-integer/negative ⇒ default `1`) gating the threshold, plus documentation of the no-false-greens policy and its thesis link.

### Out of Scope
- Running e2e in the first place / putting e2e into the verify path (sibling `fix-verify-must-exercise-running-app`).
- UI-specific "e2e/integration portion fully skipped on a UI cycle" detection — depends on the e2e-in-verify-path sibling landing and on per-suite attribution; deferred to a follow-up cycle.
- Walkthrough degradation gating (sibling `fix-walkthrough-degradation-is-a-blocking-gate`).
- Adding new reporters beyond the listed set; unknown formats deliberately degrade to exit-code-only.

## Requirements
- The parser is a pure function with no I/O; it accepts a string and returns `{ executed, skipped, total } | null`. `executed` = non-skipped tests that actually ran.
- The hook fires only for bash steps whose name is `verify` or `final_verify`, and only when the step already exited 0 — it never converts a non-zero exit into a different outcome, and never runs for agent steps.
- The full verify stdout must be available to the parser. Reuse the existing failed-bash `.out` artifact / `truncateHeadCapped` stdout capture machinery; if only a head-capped excerpt is available, parse the captured stdout buffer (reporter summaries appear at the tail, so ensure the parser sees enough output — tail-capped capture for the verify step if head-capping would drop the summary).
- The degenerate decision is fail-closed: a confidently-parsed zero-execution run blocks. The unparseable case is fail-open: `null` ⇒ no event, no status change, behavior byte-for-byte identical to today.
- The `verify.unverified` event fires **exactly once** per degenerate verify step (cardinality-pin tests with `filter(...).length === 1`).
- **Failure behavior**: On unparseable reporter output the parser returns `null` and the engine preserves current exit-code-only behavior (no event, no block — no false positive). On a genuinely degenerate run (parsed `executed === 0` with skips/total present) the step is marked failed and the cycle blocks/retries through the existing path with a clear `verification incomplete: N tests skipped, 0 executed — cannot confirm the app works` stderr message — never a silent drain to `done/ ok`. A parser internal error is contained (treated as `null`, fail-open) and never throws out of `runCycle`.

## Acceptance Criteria
- [ ] A verify run that exits 0 but executed zero non-skipped tests (e.g. all tests skipped) does NOT pass — the cycle blocks/fails and a `verify.unverified` event plus the `verification incomplete: … 0 executed …` stderr diagnostic are produced. *(user-observable benefit: an operator can trust `done/ ok` means tests ran)*
- [ ] A verify run that executed ≥1 non-skipped test with some legitimate skips still passes — no `verify.unverified`, cycle proceeds (no over-blocking).
- [ ] Unparseable verify output degrades to current exit-code-only behavior: the parser returns `null`, no `verify.unverified` fires, and the cycle outcome is byte-for-byte unchanged vs the pre-change baseline. *(failure-path criterion: confident-parse-only blocking, no false block on unknown format)*
- [ ] `verify.unverified` fires exactly once for a degenerate verify step (asserted with `filter(predicate).length === 1`).
- [ ] The parser correctly extracts counts from vitest/jest, node:test, pytest, and cargo summary formats (table-driven unit tests), and returns `null` for output containing no recognized summary.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced; `npm run typecheck` clean.

## Testing Strategy
- Node's built-in `node:test` (repo convention; `--experimental-strip-types`, no transpile).
- Unit tests for `verify-counts.ts`: a fixture table of real reporter summaries (vitest, jest, node:test, pytest, cargo) → expected `{ executed, skipped, total }`; plus garbage/empty/partial inputs → `null`.
- run-cycle integration tests driving a stubbed bash verify step: (a) all-skipped output → step failed + exactly-one `verify.unverified`; (b) zero-tests output → block; (c) normal pass with a few skips → `ok`, no event; (d) unparseable output → unchanged outcome (no event, no block); (e) non-zero verify exit → existing failure path unchanged (hook does not fire).
- Config-coercion tests for `engine.verify_min_executed`: default `1`, and malformed/negative/absent ⇒ `1`.
- Coverage: add `src/engine/verify-counts.ts` to the per-file floor table (≥95% line) and report numbers in `BUILD.md`. No UI changes ⇒ no Playwright work in this cycle.

## Documentation Updates
- **CLAUDE.md**: document the `verify.unverified` degenerate-verification gate and the `engine.verify_min_executed` knob under the run-cycle / no-false-greens notes, including the fail-closed (degenerate blocks) / fail-open (unparseable unchanged) split and the thesis link.
- **docs/ENGINE.md**: add a *Degenerate verification gate* section describing the parser, the hooked step names (`verify` / `final_verify`), the event schema, and the exit-code-only fallback.
- **BRIEF.md**: cross-link from the Core thesis paragraph to the implemented gate (no-false-greens policy is now partially operationalized; sibling cycles cover e2e-in-verify-path and walkthrough gating).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The existing bash-step stdout capture in `src/engine/run-cycle.ts` (head-capped `stdout` excerpt + `.out` artifact) — extended so the verify step's reporter summary is visible to the parser.
- The existing step-failure / `max_cycle_attempts` retry and terminal-drain machinery — the gate reuses it by setting `r.status = "failed"`; no new halt reason is introduced.
- `loadConfig` (`src/engine/workflow.ts` / config read site) for the defensively-coerced `engine.verify_min_executed` knob.
- No external services or env vars required.
