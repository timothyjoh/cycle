# Implementation Plan: Cycle 0272

## Overview
Teach the engine to recognize a **degenerate verification** — a `verify`/`final_verify` bash step that exits 0 but executed zero non-skipped tests — and route it through the existing step-failure path as *unverified*, instead of draining the issue to `done/ ok`. Delivered as a pure reporter-output parser plus a fail-closed/fail-open run-cycle hook gated by a defensively-coerced `engine.verify_min_executed` knob.

## Current State (from Research)
- The `while (true)` step loop in `runCycle` (`src/engine/run-cycle.ts:646-715`) dispatches bash steps via `execBashStep`; the full `StepResult` with the **complete** in-memory `r.stdout` buffer is in scope from the loop exit (`:715`) through `step.end` (`:915`). Reporter summaries live at the tail of that buffer, so no new capture machinery is needed.
- Bash steps have no post-success handling — the `if (step.agent !== "bash")` block (`:722-891`) is skipped, and control falls to the failed-bash `.out` capture (`:898-914`, gated on `r.status === "failed"`) then `step.end`.
- The established pattern for flipping an exit-0 step to a retryable failure is `r.status = "failed"; r.exitCode = r.exitCode || 1; r.stderr = <formatted>;` (completion-proof at `:760-763`, empty-diff guard at `:843-845`).
- Pure-classifier template: `src/engine/noop-marker.ts` (module-level regex constants, never-throws pure function, discriminated return type).
- Read-site integer-knob coercion model: `max_rate_limit_retries` at `:643-645` (`typeof === "number" && Number.isInteger && > 0`). `verify_min_executed` follows this convention — no `loadConfig` change, only an `EngineConfig` type field.
- Formatted-error helpers are exported pure string builders (`formatEmptyDiffGuardError` et al., `:311-321`).
- Test templates: `tests/engine/noop-marker.test.ts` (pure table test), `tests/engine/run-cycle.step-end-stdout.test.ts:15-257` (integration driving bash verify steps with controlled stdout/exit). Coverage floors in `scripts/coverage-gate.mjs` `FLOORS` table + CLAUDE.md.

## Desired End State
- A new pure module `src/engine/verify-counts.ts` exporting `parseVerifyCounts(s: string): { executed, skipped, total } | null`, recognizing vitest, jest, node:test, pytest, and cargo summaries; `null` on unrecognized/garbage/empty input.
- `runCycle` hooks the bash success path: after a step named `verify`/`final_verify` exits 0, it parses `r.stdout`; on a confident degenerate verdict it sets `r.status = "failed"`, emits `verify.unverified { cycle_id, step, executed, skipped, total, reason }` exactly once, and surfaces the `verification incomplete: …` diagnostic via `r.stderr` — which then flows through the unchanged failed-bash `.out` capture, `step.end { status: "failed" }`, and the supervisor's retry/terminal path.
- `EngineConfig.verify_min_executed?: number` (default `1`, read-site coerced).
- Docs updated: CLAUDE.md run-cycle note, `docs/ENGINE.md` *Degenerate verification gate* section, BRIEF.md Core-thesis cross-link.
- Verify: `npm test`, `npm run typecheck`, `npm run check:coverage` (with the new ≥95% floor) all pass.

## What We're NOT Doing
- Running e2e or putting e2e into the verify path (sibling `fix-verify-must-exercise-running-app`).
- Per-suite attribution / "e2e portion fully skipped on a UI cycle" detection (deferred follow-up).
- Walkthrough degradation gating (sibling `fix-walkthrough-degradation-is-a-blocking-gate`).
- Adding reporters beyond the five listed; unknown formats deliberately degrade to exit-code-only.
- Altering the non-zero-exit verify path, agent-step handling, or any other workflow step.
- New tail-capping capture machinery — the in-memory `r.stdout` buffer already holds the full output the parser reads (the `MAX_STEP_END_STDOUT` head-cap applies only to the persisted event field, not the buffer).

## Implementation Approach
Two units mirroring the `noop-marker.ts` precedent: (1) a side-effect-free parser whose only job is string → counts; (2) a thin name-keyed hook in `runCycle` that consumes the parser and reuses the existing `r.status = "failed"` failure-routing mechanism plus the failed-bash `.out` capture for surfacing. The hook is placed **after the rate-limit/timeout handling (after `:721`) and before the failed-bash capture (`:898`)**, inside (and gated to) the bash path, so flipping `r.status` to `"failed"` naturally activates the existing `.out` artifact write and `step.end` failed-status branch with no new surfacing code.

Decisions resolving the RESEARCH open questions:
- **Gate condition**: `executed < verifyMinExecuted` AND `(skipped > 0 || total > 0)`. The knob sets the floor (default `1`), so the default reproduces the SPEC's `executed === 0` rule while remaining configurable. The `(skipped > 0 || total > 0)` precondition prevents a parser that found a summary reporting `0/0/0` (no tests defined at all — not the targeted "everything skipped" case) from blocking; combined with `null`-on-unrecognized, this keeps the gate fail-closed only on a confident degenerate parse.
- **`executed` semantics**: non-skipped tests that produced a pass/fail result = `passed + failed`. `skipped` includes reporter-specific skip synonyms (`skipped`, `ignored`, node:test `skip` + `todo`). `total` = the reporter's explicit total when present, else `executed + skipped`.
- **`final_verify` routing**: flipping it to `failed` routes identically to a non-zero `final_verify` exit today (both set `r.status = "failed"` before `step.end`); downstream `documentation`/`walkthrough_capture` steps never run because the supervisor halts/retries on the failed cycle. No special-casing.
- **`.out` artifact**: yes — the degenerate verdict makes `isFailedBash` true, so the existing `<step>.out` capture is the intended surfacing. No separate artifact.

## Failure & Resilience Decisions

**Task 1 — `parseVerifyCounts` (pure parser)**: N/A — pure. No I/O, no throw surface. Defensive design: each reporter branch is independent and regex-guarded; malformed/partial input falls through to `return null`. Numeric extraction uses `Number.parseInt` on captured digit groups (regex guarantees digits), never `NaN`-producing.

**Task 2 — run-cycle verify hook**:
- *Failure modes*: (a) parser returns `null` (unrecognized/garbage) ⇒ fail-open: no event, no status change, byte-for-byte unchanged outcome. (b) parser throws unexpectedly ⇒ contained in a `try/catch` treating it as `null` (fail-open); the error never propagates out of `runCycle`. (c) confident degenerate verdict ⇒ fail-closed: `r.status = "failed"`, routed through the existing retry/terminal-drain path — never a silent drain.
- *Idempotency*: stateless and re-derived from `r.stdout` on every run. On resume/retry the step re-runs and the hook recomputes the same verdict from the same output — safe to re-run, no dedup key, no persisted state.
- *Observability*: `verify.unverified { cycle_id, step, executed, skipped, total, reason }` emitted exactly once on a degenerate verdict; the `verification incomplete: N tests skipped, 0 executed — cannot confirm the app works` diagnostic written to `r.stderr` (surfaced in `step.end.stderr` and the `.out` artifact). The fail-open `null` path is intentionally silent (no spam) — matching the empty-diff-guard precedent.
- *No silent failure*: the only swallowed error is the contained parser-internal `catch`, which is the *defined* fail-open behavior (preserving today's exit-code-only outcome) and is asserted by a test; it surfaces as "no block, unchanged outcome", never as a masked real failure. A genuine degenerate run always surfaces as event + stderr + failed cycle.

**Task 3 — `verify_min_executed` config knob**: N/A — pure read-site coercion. Malformed/negative/non-integer/absent ⇒ default `1` via the `typeof === "number" && Number.isInteger && >= 0` guard; never throws.

**Task 4 — Documentation**: N/A — pure docs.

---

## Task 1: Pure reporter-output parser `src/engine/verify-counts.ts`

### Overview
A side-effect-free function extracting `{ executed, skipped, total }` from common test-runner summaries, returning `null` when no recognized summary is present. Models `noop-marker.ts`.

### Changes Required
**File**: `src/engine/verify-counts.ts` (new)
**Changes**:
```ts
export type VerifyCounts = { executed: number; skipped: number; total: number };

// Reporter summary patterns. Each is anchored to a recognizable summary line so
// arbitrary prose never matches. executed = non-skipped tests that produced a
// pass/fail result (passed + failed); skipped = skipped/ignored/todo; total =
// the reporter's explicit total when present, else executed + skipped.

// jest:   "Tests:       12 passed, 3 skipped, 15 total"  (also failed, todo)
const JEST_RE = /Tests:\s+(.+)$/m;            // parse the count clause field-wise
// vitest: "Tests  12 passed | 3 skipped (15)"  /  "Test Files ..." ignored
const VITEST_RE = /\bTests\s+([\d]+ (?:passed|failed|skipped|todo)(?:\s*\|\s*[\d]+ \w+)*)\s*\((\d+)\)/;
// pytest: "===== 12 passed, 3 skipped in 1.23s ====="
const PYTEST_RE = /=+\s*(.+?)\s+in\s+[\d.]+s\s*=+/;
// cargo:  "test result: ok. 12 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out"
const CARGO_RE = /test result:\s*\w+\.\s*(\d+) passed;\s*(\d+) failed;\s*(\d+) ignored/;
// node:test: "# tests 15" / "# pass 12" / "# fail 0" / "# skip 3" / "# todo 0"
const NODE_TESTS_RE = /^# tests (\d+)/m;
const NODE_PASS_RE  = /^# pass (\d+)/m;
const NODE_FAIL_RE  = /^# fail (\d+)/m;
const NODE_SKIP_RE  = /^# skip (\d+)/m;
const NODE_TODO_RE  = /^# todo (\d+)/m;

export function parseVerifyCounts(output: string): VerifyCounts | null {
  if (typeof output !== "string" || output.length === 0) return null;
  // Try node:test first (multi-line, most specific markers).
  const ntTests = NODE_TESTS_RE.exec(output);
  if (ntTests) {
    const pass = num(NODE_PASS_RE, output), fail = num(NODE_FAIL_RE, output);
    const skip = num(NODE_SKIP_RE, output), todo = num(NODE_TODO_RE, output);
    const total = Number.parseInt(ntTests[1], 10);
    return { executed: pass + fail, skipped: skip + todo, total };
  }
  // cargo
  const cg = CARGO_RE.exec(output);
  if (cg) {
    const passed = +cg[1], failed = +cg[2], ignored = +cg[3];
    return { executed: passed + failed, skipped: ignored, total: passed + failed + ignored };
  }
  // jest / pytest / vitest: parse a "N word, N word, …" clause field-wise.
  const clause = (JEST_RE.exec(output)?.[1]) ?? (PYTEST_RE.exec(output)?.[1]) ?? null;
  if (clause) {
    const c = parseClause(clause);
    if (c) return c;
  }
  const vt = VITEST_RE.exec(output);
  if (vt) {
    const c = parseClause(vt[1]);
    if (c) return { executed: c.executed, skipped: c.skipped, total: Number.parseInt(vt[2], 10) };
  }
  return null;
}

// "12 passed, 3 skipped, 15 total" / "12 passed | 3 skipped" → counts.
function parseClause(s: string): VerifyCounts | null {
  let passed = 0, failed = 0, skipped = 0, total: number | null = null, saw = false;
  for (const m of s.matchAll(/(\d+)\s+(passed|failed|skipped|ignored|todo|total)/g)) {
    saw = true;
    const n = Number.parseInt(m[1], 10);
    switch (m[2]) {
      case "passed": passed = n; break;
      case "failed": failed = n; break;
      case "skipped": case "ignored": skipped += n; break;
      case "todo": skipped += n; break;
      case "total": total = n; break;
    }
  }
  if (!saw) return null;
  const executed = passed + failed;
  return { executed, skipped, total: total ?? executed + skipped };
}

const num = (re: RegExp, s: string): number => {
  const m = re.exec(s);
  return m ? Number.parseInt(m[1], 10) : 0;
};
```
(`parseClause`/regex set finalized against the canonical formats listed in the docstrings; `vitest` total comes from the trailing `(N)`. `jest` total via the `total` token.)

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Table-driven unit tests pass for all five reporters and for garbage/empty/partial inputs (`null`).
- [ ] Pure — no imports of `node:fs`/`child_process`; never throws on any string.
- [ ] ≥95% line coverage (added to floor table in Task 3 hook / Task 5).
- [ ] Failure paths behave as designed: unrecognized input ⇒ `null` (no throw).

---

## Task 2: Run-cycle degenerate-verification hook

### Overview
After a bash `verify`/`final_verify` step exits 0, parse its stdout and block on a confident degenerate verdict. Reuses the `r.status = "failed"` mechanism and the existing failed-bash `.out`/`step.end` surfacing.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Import the parser: `import { parseVerifyCounts } from "./verify-counts.ts";`
2. Add an exported formatter near the other formatters (`:311-325`):
```ts
export function formatVerifyUnverifiedError(skipped: number, executed: number): string {
  return `verification incomplete: ${skipped} tests skipped, ${executed} executed — cannot confirm the app works`;
}
```
3. Insert the hook **after** the timeout handling (`:721`, after the `if (r.timedOut)` emit) and **before** the failed-bash `.out` capture (`:898`), gated to the bash path so flipping `r.status` activates the existing capture:
```ts
// Degenerate-verification gate (no false greens): a verify/final_verify bash
// step that exits 0 but executed zero non-skipped tests is unverified, not
// green. Fail-closed on a confident degenerate parse; fail-open (unchanged)
// when output is unparseable. claudecode/agent steps and non-zero exits are
// untouched. Reuses r.status="failed" → existing failed-bash .out capture +
// retry path; no new halt reason.
if (
  step.agent === "bash" &&
  r.status === "ok" &&
  (step.name === "verify" || step.name === "final_verify")
) {
  const rawFloor = cfg.engine.verify_min_executed;
  const minExecuted =
    typeof rawFloor === "number" && Number.isInteger(rawFloor) && rawFloor >= 0 ? rawFloor : 1;
  let counts: ReturnType<typeof parseVerifyCounts> = null;
  try {
    counts = parseVerifyCounts(r.stdout);
  } catch {
    counts = null; // fail-open: parser error degrades to exit-code-only
  }
  if (counts && counts.executed < minExecuted && (counts.skipped > 0 || counts.total > 0)) {
    await log.emit("verify.unverified", {
      cycle_id: cycleId,
      step: step.name,
      executed: counts.executed,
      skipped: counts.skipped,
      total: counts.total,
      reason: "zero_executed",
    });
    r.status = "failed";
    r.exitCode = r.exitCode || 1;
    r.stderr = formatVerifyUnverifiedError(counts.skipped, counts.executed);
  }
}
```

### Success Criteria
- [ ] Builds cleanly; `npm run typecheck` clean.
- [ ] All-skipped verify output (exit 0) ⇒ step failed + exactly-one `verify.unverified` (`filter(...).length === 1`) + `verification incomplete: …` in `step.end.stderr` and the `.out` artifact.
- [ ] ≥1 executed with some skips ⇒ no event, `ok`, cycle proceeds.
- [ ] Unparseable output ⇒ `null`, no event, byte-for-byte unchanged outcome.
- [ ] Non-zero verify exit ⇒ hook does not fire; existing failure path unchanged.
- [ ] Agent steps and non-`verify` bash steps ⇒ hook never runs.
- [ ] Failure paths behave as designed: parser internal error is contained (fail-open), never throws out of `runCycle`.

---

## Task 3: `engine.verify_min_executed` config knob

### Overview
Add the typed, read-site-coerced knob (default `1`). No `loadConfig` change — follows the `max_rate_limit_retries` convention.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**: add to `EngineConfig` (`:35-73`):
```ts
/** Minimum non-skipped tests a verify/final_verify step must execute for its
 * exit-0 to count as verified. Default 1; absent/non-integer/negative ⇒ 1
 * (fail-closed). Resolved defensively at the run-cycle read site. */
verify_min_executed?: number;
```
(The coercion itself lives in the Task 2 hook — `typeof === "number" && Number.isInteger && >= 0 ? rawFloor : 1`.)

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Coercion tests pass: default `1`; malformed/negative/non-integer/absent ⇒ `1`.
- [ ] Configs with no knob load unchanged (default `1` reproduces SPEC's `executed === 0` rule).

---

## Task 4: Documentation updates

### Overview
Document the gate per the SPEC's Documentation Updates section.

### Changes Required
- **File**: `CLAUDE.md` — add a `src/engine/run-cycle.ts` note (and a line under *Workflow defaults*) describing the `verify.unverified` degenerate-verification gate, the `engine.verify_min_executed` knob, hooked step names (`verify`/`final_verify`), the fail-closed (degenerate blocks) / fail-open (unparseable unchanged) split, and the Core-thesis link.
- **File**: `docs/ENGINE.md` — add a *Degenerate verification gate* section (near *Completion-proof post-condition* `:163` / *Failed bash-step stdout capture* `:274`) covering the parser, hooked step names, event schema `verify.unverified { cycle_id, step, executed, skipped, total, reason }`, the `(skipped > 0 || total > 0)` precondition, and the exit-code-only fallback.
- **File**: `BRIEF.md` — cross-link the Core-thesis paragraph (`:7`) to the implemented gate (no-false-greens partially operationalized; siblings cover e2e-in-verify and walkthrough gating).

### Success Criteria
- [ ] All three docs updated and internally consistent with the implemented event/knob names.
- [ ] No dangling references to unimplemented behavior.

---

## Task 5: Tests + coverage floor

### Overview
Unit table tests for the parser, integration tests for the hook, config-coercion tests, and the coverage-floor registration.

### Changes Required
- **File**: `tests/engine/verify-counts.test.ts` (new) — table-driven fixtures (real vitest/jest/node:test/pytest/cargo summaries → expected counts) + garbage/empty/partial → `null`. Template: `tests/engine/noop-marker.test.ts`.
- **File**: `tests/engine/run-cycle.verify-unverified.test.ts` (new) — driving stubbed bash verify steps (template: `tests/engine/run-cycle.step-end-stdout.test.ts:15-257`): (a) all-skipped → failed + exactly-one `verify.unverified`; (b) zero-tests-with-total → block; (c) normal pass w/ skips → `ok`, no event; (d) unparseable → unchanged outcome; (e) non-zero verify exit → hook does not fire; (f) `final_verify` degenerate → routes like a non-zero `final_verify`.
- **File**: config-coercion test (extend an existing `loadConfig`/engine-config test or add to the verify integration file) — default `1`, malformed/negative/absent ⇒ `1`.
- **File**: `scripts/coverage-gate.mjs` — add `"src/engine/verify-counts.ts": 95` to the `FLOORS` table.
- **File**: `CLAUDE.md` — add `src/engine/verify-counts.ts` (95%) to the *Coverage policy* per-file floors list.

### Success Criteria
- [ ] `npm test` passes (new + existing).
- [ ] `npm run check:coverage` passes with `verify-counts.ts` ≥95% line.
- [ ] `verify.unverified` cardinality-pinned with `filter(predicate).length === 1`.
- [ ] Failure-path tests cover: unparseable (`null`, no block), parser-error containment (fail-open), non-zero exit (hook inert).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A verify run that exits 0 but executed zero non-skipped tests (e.g. all tests skipped) does NOT pass — the cycle blocks/fails and a `verify.unverified` event plus the `verification incomplete: … 0 executed …` stderr diagnostic are produced. *(user-observable benefit: an operator can trust `done/ ok` means tests ran)* | Task 2, Task 5 | Hook flips `r.status="failed"`, emits event, sets stderr; integration test (a)/(b) |
| [ ] A verify run that executed ≥1 non-skipped test with some legitimate skips still passes — no `verify.unverified`, cycle proceeds (no over-blocking). | Task 2, Task 5 | `executed < minExecuted` is false for `executed ≥ 1` with default floor; integration test (c) |
| [ ] Unparseable verify output degrades to current exit-code-only behavior: the parser returns `null`, no `verify.unverified` fires, and the cycle outcome is byte-for-byte unchanged vs the pre-change baseline. *(failure-path criterion: confident-parse-only blocking, no false block on unknown format)* | Task 1, Task 2, Task 5 | Parser returns `null`; hook fail-open; integration test (d) |
| [ ] `verify.unverified` fires exactly once for a degenerate verify step (asserted with `filter(predicate).length === 1`). | Task 2, Task 5 | Single emit inside the gated branch; cardinality-pinned test |
| [ ] The parser correctly extracts counts from vitest/jest, node:test, pytest, and cargo summary formats (table-driven unit tests), and returns `null` for output containing no recognized summary. | Task 1, Task 5 | Five reporter branches + `null` fallback; table fixtures |
| [ ] All existing tests still pass. | Task 2, Task 5 | Hook is additive and gated to exit-0 verify bash steps only |
| [ ] No compiler/linter warnings introduced; `npm run typecheck` clean. | Task 1, Task 2, Task 3 | Typed parser + `EngineConfig` field |

---

## Testing Strategy

### Unit Tests
- `parseVerifyCounts`: a fixture table mapping a real summary string per reporter (vitest `Tests  12 passed | 3 skipped (15)`; jest `Tests:       12 passed, 3 skipped, 15 total`; node:test `# tests 15`/`# pass 12`/`# fail 0`/`# skip 3`/`# todo 0`; pytest `===== 12 passed, 3 skipped in 1.23s =====`; cargo `test result: ok. 12 passed; 0 failed; 3 ignored; …`) → expected `{ executed, skipped, total }`, including all-skipped variants (`0 passed, 15 skipped`).
- **Failure-path tests**: empty string, whitespace, prose with no summary, partial/truncated summary, non-string input (cast) → `null`. Confirms no false positive and no throw.
- Config coercion: `verify_min_executed` of `undefined`, `0`, `-3`, `2.5`, `"1"`, `NaN`, `Infinity` → coerced floor (default `1`; `0`/valid integers honored where `>= 0`).
- **Mocking strategy**: none for the parser (pure, real strings). Real `loadConfig` for coercion tests.

### Integration / E2E Tests
- Drive `runCycle` against a temp git repo with a synthetic `.cycle/workflows.yml` and a bash `verify` script emitting controlled stdout + exit code (template `run-cycle.step-end-stdout.test.ts`):
  - (a) verify exits 0 with all-skipped output ⇒ assert `step.end { status: "failed" }`, exactly-one `verify.unverified`, `verification incomplete: …` in stderr + `.out` artifact.
  - (b) verify exits 0 with `0 executed, total > 0` ⇒ block.
  - (c) verify exits 0 with `12 passed, 3 skipped` ⇒ `ok`, no `verify.unverified`.
  - (d) verify exits 0 with unparseable output ⇒ outcome byte-for-byte unchanged, no event.
  - (e) verify exits non-zero ⇒ existing failure path, hook does not fire (no `verify.unverified`).
  - (f) `final_verify` degenerate ⇒ routes through the failed-cycle path like a non-zero `final_verify`.

## Risk Assessment
- **Reporter format drift / dialect variance** (e.g. vitest version differences, locale): mitigated by fail-open `null` on non-match — an unrecognized dialect degrades to today's behavior, never a false block. New dialects are additive follow-ups.
- **A summary string appearing in unrelated stdout prose**: regexes are anchored to recognizable summary leaders (`Tests:`, `test result:`, `# tests`, `===== … in Ns =====`); the `(skipped > 0 || total > 0)` precondition plus `executed < floor` further constrain blocking to genuine degenerate runs.
- **Over-blocking a legitimately empty suite (`0/0/0`)**: the `(skipped > 0 || total > 0)` precondition means a parsed all-zero summary does not block (it is not the "everything skipped" target); only a run with skips or a positive total and zero executed blocks.
- **Head-cap dropping the tail summary**: not a risk — the parser reads the full in-memory `r.stdout` buffer; head-capping applies only to the persisted `step.end`/`.out` event fields, and the `.out` artifact is best-effort and orthogonal to the verdict.
