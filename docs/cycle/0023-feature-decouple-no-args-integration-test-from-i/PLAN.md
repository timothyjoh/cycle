# Implementation Plan: Cycle 0023

## Overview
Rewrite the single no-args integration test in `tests/cli/help.test.ts` so it verifies the stable observable contract of a bare `cycle` invocation — clean exit (`status === 0`) plus the absence of any argument-parse error string — instead of string-matching the internal `'"event":"engine.start"'` JSONL substring that couples it to log encoding and stdout routing.

## Current State (from Research)
- The target test lives at `tests/cli/help.test.ts:81-103`, titled `"cycle with no args begins queue drain — emits engine.start and exits 0"`.
- It currently makes three assertions: `r.status === 0` (`:91`), `r.stdout.includes('"event":"engine.start"')` (`:92-95`), and `!r.stderr.includes("unknown command")` (`:96-99`).
- Helpers `ensureDist()` (`:11-15`) and `bootstrapMinimal()` (`:31-42`) bootstrap a minimal trunk-mode repo and run the built `dist/cycle.js` via `spawnSync`. The test body is wrapped in `try { … } finally { await rm(root, …) }` with a 30s `timeout`.
- File idioms: exit-code assertions carry `expected exit 0, got ${r.status}. stderr: ${r.stderr}` diagnostics; stable string contracts are named as module constants (`USAGE_SENTINEL` at `:9`); a negative-assertion idiom (`!r.stderr.includes("unknown command")`) already exists.
- Parse-error strings the no-args/run path can produce: `unknown command: …` (`src/cli/parse-args.ts:40`) and Node's `nodeParseArgs` `ERR_PARSE_ARGS_UNKNOWN_OPTION` / `Unknown argument` family (`:42-52`).
- `src/cli.ts` has **no per-file coverage floor**; the no-args test contributes to its aggregate coverage by spawning the full binary. No `src/` code changes this cycle — test-only.

## Resolved Open Questions
1. **Which parse-error substrings to assert, and which stream.** Assert against the full candidate family — `unknown command`, `Unknown argument`, `ERR_PARSE_ARGS_UNKNOWN_OPTION` — checked over the **combined** `r.stdout + r.stderr`. Rationale: `parse-args.ts` throws `unknown command` itself (lands on stderr today), while Node's `nodeParseArgs` errors surface as `ERR_PARSE_ARGS_*` / `Unknown argument`; checking the combination across both streams keeps the guard robust to which stream an error lands on, which is the same routing-independence the cycle is hardening for. This is strictly stronger than the removed `unknown command`-only stderr check, so no regression detection is lost.
2. **Named constant vs inline.** Introduce a module-level `PARSE_ERROR_SENTINELS` constant (array of strings), matching the `USAGE_SENTINEL` idiom at `:9`. It documents the public-contract intent and is reusable in the diagnostic message.

## Desired End State
- `tests/cli/help.test.ts` no longer contains the substring `'"event":"engine.start"'`.
- The no-args test retains its exit-code assertion, adds a parse-error-absence assertion over combined stdout+stderr, and carries an anchoring comment explaining the stable-contract rationale and why the JSONL match was removed.
- The test title accurately describes what is asserted (no stale "emits engine.start" claim).
- `npm test`, `npm run typecheck`, and `npm run test:coverage` (with `check:coverage` / `check:invariants`) all pass; coverage does not decrease vs the master baseline.

Verify: `grep -c '"event":"engine.start"' tests/cli/help.test.ts` returns `0`; `npm test` green; `npm run test:coverage` shows `src/cli.ts` at or above its existing aggregate level.

## What We're NOT Doing
- Not changing engine log routing (moving structured JSONL from stdout to stderr) — out of scope per SPEC.
- Not modifying any other test in `tests/cli/help.test.ts` or elsewhere that asserts on JSONL event strings.
- Not touching any `src/` production code (`src/cli.ts`, `src/engine/log.ts`, `src/cli/parse-args.ts`, etc.).
- Not declaring `engine.start`-on-stdout a documented machine-readable public contract in `BRIEF.md` / `docs/ARCHITECTURE.md` (the SPEC's alternative path is explicitly not taken).
- Not adding a separate "deliberately broken bare-`cycle`" fixture test — the failure-path acceptance is satisfied by the retained exit-code assertion, verified by reasoning.
- Not converting the removed assertion into a new bare-existence JSONL event check.

## Implementation Approach
A single, surgical, test-only edit. Add a `PARSE_ERROR_SENTINELS` module constant near `USAGE_SENTINEL`. In the no-args test: (1) update the title to drop "emits engine.start"; (2) keep the `assert.equal(r.status, 0, …)` crash guard verbatim; (3) replace the `engine.start` stdout-substring assertion with a single negative assertion that no `PARSE_ERROR_SENTINELS` entry appears in the combined `r.stdout + r.stderr`; (4) drop the now-subsumed standalone `unknown command` stderr check (its detection is fully absorbed by the new combined-stream check); (5) add an anchoring comment. Preserve `ensureDist`/`bootstrapMinimal`, the 30s `timeout`, and the `finally` cleanup unchanged.

## Failure & Resilience Decisions

**Task 1 — Rewrite the no-args test assertions (test artifact, not production code).**
- **Failure modes**: The test's "failure surface" is its assertion behavior. The spawned `dist/cycle.js` may exit non-zero (crash / unhandled error / triage pause → exit 1), time out (30s `timeout` → `r.status === null`), or emit a parse-error string. Each must fail the test. The exit-code assertion catches non-zero and timeout (`null !== 0`); the sentinel assertion catches parse regressions on either stream.
- **Idempotency**: The test is re-run-safe by construction — each run allocates a fresh temp dir via `mkdtemp(join(tmpdir(), "cycle-no-args-"))`, so no stale `engine.lock` or queue state collides across runs (the engine's PID lockfile is per-temp-repo). The `finally { rm(root, { recursive: true, force: true }) }` makes cleanup idempotent and non-throwing on partial setup. The engine's retry/restart of this step cannot leak state between attempts.
- **Observability**: Both assertions include captured output in their diagnostic messages — exit-code: `expected exit 0, got ${r.status}. stderr: ${r.stderr}`; sentinel: a message naming the matched sentinel plus combined stdout/stderr — so a failure is self-diagnosing without re-running.
- **No silent failure**: No assertion is dropped without a strictly-stronger replacement (the removed `unknown command`-only stderr check is subsumed by the combined-stream `PARSE_ERROR_SENTINELS` check; the exit-code guard is retained verbatim). Failures surface as `node:test` assertion errors → non-zero `npm test` exit. No `try/catch` swallows the assertion; the only `try/finally` is for temp-dir cleanup and does not suppress assertion throws.

---

## Task 1: Rewrite the no-args integration test to assert the stable contract

### Overview
Replace the JSONL-coupled assertion with exit-code + parse-error-absence assertions, rename the test, and anchor the change with a comment. Introduce the `PARSE_ERROR_SENTINELS` module constant.

### Changes Required

**File**: `tests/cli/help.test.ts`

**Change 1 — add the sentinel constant** (near `USAGE_SENTINEL`, `:9`):
```ts
// Argument-parse failures the bare-`cycle` / run path can surface, on either
// stream: `unknown command:` (src/cli/parse-args.ts) and Node's nodeParseArgs
// ERR_PARSE_ARGS_UNKNOWN_OPTION / "Unknown argument" family for unknown flags.
const PARSE_ERROR_SENTINELS = [
  "unknown command",
  "Unknown argument",
  "ERR_PARSE_ARGS_UNKNOWN_OPTION",
] as const;
```

**Change 2 — rewrite the no-args test** (`:81-103`). New title and body:
```ts
test("cycle with no args runs a queue drain — exits 0 with no argument-parse error", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-no-args-"));
  try {
    await bootstrapMinimal(root);
    const r = spawnSync("node", [dist], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
    // Stable public contract of a bare `cycle` invocation: it parses zero args
    // cleanly and exits 0. We intentionally do NOT match the internal
    // '"event":"engine.start"' JSONL string — that coupled this test to both
    // the event encoding and the routing of structured events to stdout, so a
    // future change moving JSONL to stderr would silently pass while losing the
    // regression guard. Exit code + absence of a parse error are routing- and
    // encoding-independent.
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
    const combined = `${r.stdout}${r.stderr}`;
    for (const sentinel of PARSE_ERROR_SENTINELS) {
      assert.ok(
        !combined.includes(sentinel),
        `unexpected argument-parse error '${sentinel}' in output.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build` via `pretest`; `npm run typecheck` clean).
- [ ] `npm test` passes in full; the rewritten test passes.
- [ ] `grep -c '"event":"engine.start"' tests/cli/help.test.ts` → `0`.
- [ ] Test asserts `r.status === 0` and the absence of every `PARSE_ERROR_SENTINELS` entry over combined stdout+stderr.
- [ ] Anchoring comment present, explaining the stable-contract choice and why the JSONL match was removed.
- [ ] Test title no longer claims "emits engine.start".
- [ ] Failure paths behave as designed: a non-zero exit or any parse-error string still fails the test (errors surfaced via assertion diagnostics; no silent catch).

---

## Task 2: Confirm coverage, typecheck, and document the no-doc-change decision

### Overview
Run the verification gates and record in the build report that no documentation change is required (per SPEC's explicit instruction to state this rather than silently omit it).

### Changes Required
**File**: none (verification + reporting only).
**Actions**:
- `npm run typecheck` — clean, no warnings.
- `npm run test:coverage` — confirm `src/cli.ts` aggregate coverage is at or above its existing level and overall Line ≥ 95% / Branch ≥ 75% / Function ≥ 90% baseline holds; `check:coverage` and `check:invariants` pass.
- In `BUILD.md`/`FIX.md`, explicitly state: no `CLAUDE.md` / `AGENTS.md` / `README.md` / `BRIEF.md` / `docs/ARCHITECTURE.md` change is required (test-only decouple path; `engine.start`-on-stdout was not promoted to a documented contract).

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` passes; coverage does not decrease vs master baseline.
- [ ] Build report records the no-documentation-change decision explicitly.
- [ ] Failure paths behave as designed: N/A — verification/reporting only (gate failures surface as non-zero exits).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] `tests/cli/help.test.ts` no longer contains the substring `'"event":"engine.start"'`.` | Task 1 | Assertion removed; grep-verified. |
| `[ ] The no-args test asserts `r.status === 0`.` | Task 1 | `assert.equal(r.status, 0, …)` retained verbatim. |
| `[ ] The no-args test asserts that stdout/stderr does **not** contain an argument-parse error string (e.g. `Unknown argument` / `ERR_PARSE_ARGS_UNKNOWN_OPTION`).` | Task 1 | `PARSE_ERROR_SENTINELS` checked over combined `r.stdout + r.stderr`. |
| `[ ] A comment in the rewritten test anchors the chosen assertions to the stable-contract rationale (clean exit + no parse error), explaining why the JSONL match was removed.` | Task 1 | Anchoring comment added in test body. |
| `[ ] **Failure-path**: running the suite against a deliberately broken bare-`cycle` path (non-zero exit) causes the no-args test to fail rather than pass — verified by reasoning through the assertions (the exit-code check is retained, not removed).` | Task 1 | Exit-code assertion retained; a non-zero/timeout `r.status` fails. Verified by reasoning, no separate fixture (per SPEC). |
| `[ ] `npm test` passes in full.` | Task 1, Task 2 | |
| `[ ] `npm run test:coverage` shows `src/cli.ts` at or above its existing floor and the rewritten test fully exercised; coverage does not decrease vs the master baseline.` | Task 2 | `src/cli.ts` has no per-file floor; aggregate-contributing coverage preserved. |
| `[ ] All existing tests still pass.` | Task 1, Task 2 | Only the one test changed; rest untouched. |
| `[ ] No compiler/linter warnings introduced (`npm run typecheck` clean).` | Task 2 | |

## Testing Strategy

### Unit Tests
- The change *is* the test. The rewritten `tests/cli/help.test.ts` no-args case is the unit of verification.
- **Happy path**: bare `cycle` in a fresh minimally-bootstrapped temp repo exits `0` and emits no `PARSE_ERROR_SENTINELS` string on either stream.
- **Failure-path coverage (by assertion design, per SPEC)**:
  - *Crash / unhandled error / triage-pause exit 1 / 30s timeout*: caught by `assert.equal(r.status, 0, …)` (`null` or non-zero ≠ `0`).
  - *Parse regression* (`unknown command`, `Unknown argument`, `ERR_PARSE_ARGS_UNKNOWN_OPTION`): caught by the combined-stream sentinel loop, regardless of which stream the error lands on.
- **Mocking strategy**: none — anti-mock by default. The test spawns the real `dist/cycle.js` against a real temp git repo, matching the file's existing convention.
- **Routing-robustness check**: by inspection, the assertions reference only `r.status` and string-absence over combined stdout+stderr — no dependency on whether structured events route to stdout or stderr — so a future stderr-routing change leaves the test green without edits.

### Integration / E2E Tests
- The no-args test is itself the integration/E2E scenario (full built binary, real spawn, real temp repo). No additional E2E or Playwright needed; no UI changes.

## Risk Assessment
- **The minimal repo's real `claudecode` triage step makes the spawned process exit non-zero within 30s in CI without the agent CLI** → if this were a new risk it would already break the existing test (which also asserts `r.status === 0` on the same spawn); the exit-code assertion is unchanged, so behavior is identical to today. Mitigation: no change to bootstrap or spawn; if the existing test is green on master, the rewrite is green.
- **A legitimate future output could contain a sentinel substring as a false positive** (e.g. a log line mentioning "Unknown argument" in prose) → low risk: sentinels are specific error-class strings; the previous test already matched `unknown command`. Mitigation: sentinels chosen to match actual thrown/`ERR_PARSE_ARGS_*` strings, not generic words.
- **Coverage dip on `src/cli.ts` from removing the stdout-substring read** → none: the assertion change does not alter which code paths the spawned binary executes; the full no-args path still runs. Mitigation: confirm via `npm run test:coverage` in Task 2.
