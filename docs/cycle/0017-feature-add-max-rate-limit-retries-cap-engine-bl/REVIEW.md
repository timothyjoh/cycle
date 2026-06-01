# Review: Cycle 0017

## Overall Verdict
PASS — no fixes needed

All SPEC acceptance criteria are met, the SPEC→PLAN traceability section is complete, the implementation is correct and observable (no silent failure, no fail-open default), tests are real-implementation integration tests with strong assertions, coverage gates all pass, and every in-scope documentation claim is backed by source.

## Code Quality Review

### Summary
A tight, well-scoped change. The previously-unbounded `while (true)` rate-limit retry loop in `runCycle` is now bounded by `engine.max_rate_limit_retries` via an increment-then-compare gate placed before the backoff sleep. The defensive read-site coercion, the `engine.halted` + `cycle.end` emission, and the failed-cycle return all follow the existing terminal-failure and config-coercion conventions exactly. The early return is inside the enclosing `try` (`src/engine/run-cycle.ts:281`), so the `finally` checkout/base-pull cleanup at `src/engine/run-cycle.ts:597` still runs — verified structurally.

### Findings
1. **Correctness (boundary)**: Increment-then-compare is correct — `rateLimitRetries++` then `if (rateLimitRetries > maxRateLimitRetries)` — `src/engine/run-cycle.ts:430,437`. Rate-limiting exactly `cap` times leaves the counter at `cap` (keeps retrying); the `cap+1`-th attempt halts with `retries: cap+1`. Matches SPEC requirement "the first attempt that pushes the count past the cap."
2. **Defensive coercion**: `typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 24` — `src/engine/run-cycle.ts:404`. Rejects `0`/negative/non-integer/`NaN`/`Infinity`/non-number to the default `24`. Mirrors the iteration-too-fast guard convention. No `loadConfig` validation added, per plan.
3. **Counter scope**: `rateLimitRetries` declared inside the per-step loop body alongside `wasRateLimited` — `src/engine/run-cycle.ts:397` — so it resets per step and on resume to a new `startIdx`. Per-`runCycle`, per-step, non-persistent as required.
4. **Observability / no silent failure**: termination is surfaced via `engine.halted { reason, retries, step_index }` then `cycle.end { status: "failed" }` and a failed return — `src/engine/run-cycle.ts:438–443` — never a silent kill. The failed status routes through the unchanged terminal-failure path.
5. **No new failure surface**: no new `catch`, no swallowed errors, no fail-open default; `log.emit` behavior is identical to every other emit in the loop. Non-rate-limit control flow (`break`) is untouched — `src/engine/run-cycle.ts:445`.
6. **Idempotency**: the counter is in-memory and non-persistent, so cycle retry/restart starts fresh; the early return preserves the idempotent `finally` cleanup.
7. **Minor (non-blocking)**: the malformed-cap test drives only 5 retries, which proves the effective cap is `> 5` rather than exactly `24`. SPEC's Testing Strategy explicitly sanctioned this proxy ("Avoid driving 25 real retries… a count well under 24 demonstrates the `0`→`24` coercion"), so it is within spec; a focused 24/25-boundary case under `noopSleep` would be a strictly stronger assertion if added opportunistically — `tests/engine/rate-limit-integration.test.ts:295`.

### Spec Compliance Checklist
- [x] `EngineConfig.max_rate_limit_retries?: number` added — `src/engine/workflow.ts:48`
- [x] `src/defaults/workflows.yml` `engine:` block has `max_rate_limit_retries: 24` — `src/defaults/workflows.yml:7`
- [x] `npm run sync-defaults` leaves `.cycle/workflows.yml` in sync (re-run produced only the single intended addition, no further diff) — `.cycle/workflows.yml:7`
- [x] Per-step counter exceeding cap emits `engine.halted` + failed return before sleeping — `src/engine/run-cycle.ts:437–443`
- [x] `engine.halted` carries `retries` (actual observed count) and `step_index` — `src/engine/run-cycle.ts:439–441`
- [x] Existing pause/sleep/retry + `engine.resumed` behavior preserved while at/below cap
- [x] `0`/negative/non-integer cap degrades to `24` at read site — `src/engine/run-cycle.ts:404`
- [x] Counter increments only on `r.rateLimited`; non-rate-limit control flow untouched
- [x] `finally` checkout/base-pull cleanup runs on the early return (return at line 442 nested in `try` at line 281)
- [x] `## Acceptance Criteria` present in SPEC.md with 9 testable bullets — `SPEC.md:31–40`
- [x] `## SPEC Acceptance Traceability` present in PLAN.md re-quoting all 9 bullets verbatim with covering task ids — `PLAN.md:200–212`
- [x] CLAUDE.md config list + run-cycle note updated to "bounded" — `CLAUDE.md:72,105`
- [x] `docs/ENGINE.md` "Rate-Limit Pause/Retry Loop" cap section added; "Known limitation: unbounded" note removed — `docs/ENGINE.md:313,321–335`

## Adversarial Test Review

### Summary
Strong. Tests use a real temp git repo, real `runCycle`, and a real fake-agent shell script driven by a `call_count` file. The only seam is `sleepFn: noopSleep` — no engine internals are mocked. Assertions are specific and event-cardinality-pinned.

### Findings
1. **Real implementations**: no mock abuse — full `runCycle` against a temp repo, events parsed from real `.cycle/log.jsonl` — `tests/engine/rate-limit-integration.test.ts:218–334`.
2. **Failure path covered**: boundary-above asserts `status: "failed"`, `failingStep: "research"`, exactly one `engine.halted{rate_limit_max_retries}` (via `filter(...).length === 1`), `retries === 4`, `step_index === 0`, `cycle.end` failed, and that the second step never started — `tests/engine/rate-limit-integration.test.ts:251–290`.
3. **Boundary-below covered**: cap-times-then-success asserts zero `engine.halted`, exactly one `engine.resumed{rate_limit_cleared}`, `cycle.end` ok — `tests/engine/rate-limit-integration.test.ts:218–249`.
4. **Bad-config parameterized**: `[0, -1, "2.5"]` each assert no halt at 5 retries + exactly one `engine.resumed` — `tests/engine/rate-limit-integration.test.ts:292–333`.
5. **Cardinality pinning**: `engine.halted` asserted with `filter(...).length === 1` and `expectExactlyOne` used for `engine.resumed`/`cycle.end`, per CLAUDE.md exactly-once convention.
6. **Assertion quality**: assertions are specific (`.retries === 4`, `.step_index === 0`, `.reason === "rate_limit_cleared"`) — no weak truthiness checks.
7. **Test independence**: each test creates isolated `mkdtemp` repo+bin dirs and cleans up in `finally`; no shared state or ordering dependency.
8. **Regression**: pre-existing single/double-retry-then-success and rate-limit-then-hard-failure tests remain in the suite and green.

### Test Coverage
- Command run: `npm run test:coverage`
- Result: tests 870, pass 870, fail 0; all coverage-gate floors `ok`; all structural invariants `ok`
- `src/engine/run-cycle.ts`: 99.68% ≥ 90% per-file floor
- Regressions vs base (per-file): none
- New code without tests: none (the new halt branch is exercised by the boundary-above scenario)
- Specific scenarios missing tests: none required by SPEC; the malformed-cap test proves cap `> 5` rather than exactly `24` (sanctioned by SPEC Testing Strategy) — optional strengthening only

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `engine.max_rate_limit_retries` config field, default `24` | `CLAUDE.md:105` | `src/engine/workflow.ts:48`, `src/defaults/workflows.yml:7` | OK |
| `0`/negative/non-integer/malformed ⇒ default `24`, coerced at read site | `CLAUDE.md:105` | `src/engine/run-cycle.ts:404` | OK |
| Emits `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` | `CLAUDE.md:105` | `src/engine/run-cycle.ts:438–441` | OK |
| Then `cycle.end { status: "failed" }` and a failed return | `CLAUDE.md:105` | `src/engine/run-cycle.ts:442–443` | OK |
| Retry loop now "bounded by `engine.max_rate_limit_retries`" | `CLAUDE.md:72` | `src/engine/run-cycle.ts:437` | OK |
| Increment-then-compare; `cap+1`-th attempt halts with `retries: cap+1` | `CLAUDE.md:105`, `docs/ENGINE.md:323–326` | `src/engine/run-cycle.ts:430,437,440` | OK |
| Halt occurs **before** sleeping/retrying again | `docs/ENGINE.md:313` | `src/engine/run-cycle.ts:437–443` (gate precedes backoff at `:444`) | OK |
| Early `return` inside `try`; `finally` checkout/base-pull still runs | `docs/ENGINE.md:313` | `try` `src/engine/run-cycle.ts:281`, return `:442`, `finally` `:597` | OK |
| Coercion `typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 24` | `docs/ENGINE.md:328` | `src/engine/run-cycle.ts:404` | OK |
| `engine.halted` shape independent of supervisor `{ failed_cycles, reason, threshold }` | `docs/ENGINE.md:337` | runCycle emit `src/engine/run-cycle.ts:438–441`; supervisor emit distinct `reason` | OK |
| Counter resets each step / on resume to new `startIdx` | `docs/ENGINE.md:312` | `src/engine/run-cycle.ts:397` (declared in per-step body) | OK |
| `engine.max_rate_limit_retries` default `24`, overridable in `.cycle/workflows.yml` | `docs/ENGINE.md:342` | `src/defaults/workflows.yml:7`, `.cycle/workflows.yml:7` | OK |

No unbacked claims. The "Known limitation: unbounded" note has been removed from the rate-limit section; the only remaining `unbounded` occurrences are the new "never an unbounded or zero-length loop" coercion prose (`docs/ENGINE.md:328`) and an unrelated AC-enforcement note (`docs/ENGINE.md:236`).
