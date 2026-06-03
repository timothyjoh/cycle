All facts are now empirically resolved. Restored `run-cycle.ts` to clean state. Writing the plan.

# Implementation Plan: Cycle 0048

## Overview
Add discriminating, executable test coverage to `tests/engine/empty-diff-guard.test.ts` that locks cycle 0046's `--untracked-files=all` deviation in the `expects_code: false` doc-deliverable scan, so removing the flag from `src/engine/run-cycle.ts` produces a named `npm test` failure instead of a green suite. This is a test-only change; no production code is modified.

## Current State (from Research)

- The behavior under test lives in `src/engine/run-cycle.ts:772`–`848`: after a `build`/`fix` step exits 0 with an empty `src scripts tests` diff and `expects_code: false`, the engine scans `git status --porcelain --untracked-files=all -- docs` (`run-cycle.ts:810`) and relaxes the empty-diff guard to a normal `ok` completion iff `parseDocDeliverablePaths(...).length > 0` (`run-cycle.ts:815`–`816`, `819`). Otherwise it falls through to the `NOOP.md` marker gate and, absent a valid marker, `formatEmptyDiffGuardError` → `r.status = "failed"` (`run-cycle.ts:843`–`845`).
- `parseDocDeliverablePaths` (`run-cycle.ts:123`–`139`) keeps any porcelain path that `startsWith("docs/")`, is not `isDenied`, and is not under `docs/cycle/`. A **bare directory** entry `docs/` (i.e. `raw.slice(3) === "docs/"`) satisfies all three conditions and is therefore **kept** (returns `["docs/"]`).
- Test harness already present: `setupRepo(fakeBody, stepName)` (`:37`–`54`), `writeIssue(root, issueId, frontmatter)` (`:61`–`69`), `cleanup(root, bin)` (`:56`–`59`), `countEvents(log, pred)` (`:71`–`76`), `SHEBANG` (`:78`), and `runCycle` imported from `../../src/engine/run-cycle.ts` (`:7`). The closest mirror is the `expects_code:false … -> ok` case at `:224`–`271` (top-level `docs/RFC-x.md`).

### Resolved open questions (empirically verified during planning)

The RESEARCH open question — *"is the discriminating mechanism best asserted via the `ok`/no-`noop` outcome, or only by manual flag-removal?"* — was resolved by running the suite with `--untracked-files=all` temporarily removed from `run-cycle.ts:810` (then restored, tree confirmed clean):

1. **A real doc deliverable in a brand-new untracked subtree is NOT outcome-discriminating.** When `docs/` is wholly untracked (the test-repo state), `git status --porcelain -- docs` (normal mode) collapses the entire tree to a single `?? docs/` entry. `parseDocDeliverablePaths("?? docs/\n")` returns `["docs/"]` (length 1 > 0), so the guard relaxes to `ok` **with or without** the flag. The top-level `docs/RFC-x.md` case (`:224`) stayed green in both modes; an `adr/`-subtree variant behaves identically. **A deliverable-present case asserting `ok` cannot fail when the flag is removed.** (Verified: `git status --porcelain --untracked-files=all -- docs` lists `?? docs/adr/0001.md`; without the flag it emits only `?? docs/`.)
2. **A case with NO in-scope deliverable IS outcome-discriminating.** With the flag, the per-file scan correctly sees only excluded `docs/cycle/**` artifacts → no deliverable → `formatEmptyDiffGuardError` → `failed`. Without the flag, the whole-`docs/` collapse `?? docs/` is mis-kept as `["docs/"]` → guard wrongly relaxes → `ok`. Confirmed: removing the flag flips the existing anti-slop case `:273` from `failed`→`ok`, breaking its `assert.equal(r.status, "failed")` (suite went 9-pass → 8-pass/1-fail).

**Consequence for this cycle:** the flag changes behavior *only on the no-in-scope-deliverable path*. The SPEC's two binding intents are mutually exclusive in a single case: AC1/AC3 (deliverable present → assert `ok`) is necessarily non-discriminating, while AC4 / the USABLE END-STATE ("if they remove the flag, the new case fails") is achievable **only** on a no-in-scope-deliverable path asserting `failed`. The plan therefore adds **two** minimal, self-contained cases — one for each intent — because no single case can satisfy both (proven above). The In-Scope "one new integration test case" line is treated as a guideline subordinate to the six numbered Acceptance Criteria, which the `review` step traces against.

## Desired End State

`tests/engine/empty-diff-guard.test.ts` contains two new cases:
- a **positive** case (deliverable in a brand-new untracked subdirectory `docs/adr/0001.md`) asserting the cycle resolves `ok`, no `cycle.noop`, and the deliverable is committed;
- a **discriminating lock** case (a brand-new untracked subtree whose only content is excluded under `docs/cycle/**`, i.e. no in-scope deliverable) asserting the cycle resolves `failed` with the empty-diff-guard error — a case that flips to `ok` (test fails) the moment `--untracked-files=all` is removed from `run-cycle.ts:810`.

Verification: `npm test` and `npm run typecheck` pass against current code; manually removing the flag at `run-cycle.ts:810` makes the discriminating-lock case fail; restoring it returns the suite to green.

## What We're NOT Doing

- No change to production code in `src/engine/run-cycle.ts` (`resolveExpectsCode`, `parseDocDeliverablePaths`, the doc-deliverable scan, or the flag itself).
- No new `scripts/structural-invariants.mjs` entries and no coverage-floor changes.
- No refactoring, renaming, or de-duplication of the existing test cases (`:80`–`336`), including the anti-slop case `:273` (which incidentally already flips on flag removal).
- No new test infrastructure or helpers — reuse `setupRepo`/`writeIssue`/`cleanup`/`countEvents`/`SHEBANG`/`runCycle`.
- No documentation edits — the `--untracked-files=all` behavior is already described in the run-cycle notes (CLAUDE.md / `docs/ENGINE.md`); no convention or command changed.
- No automated in-suite "remove-the-flag-and-rerun" harness (would require mutating source mid-test); the lock is delivered by the discriminating case's outcome assertion.

## Implementation Approach

Mirror the existing `expects_code:false … -> ok` case (`:224`–`271`) for structure, fixtures, and assertions. Add two `test(...)` blocks at the end of the file (after `:336`), each with its own `setupRepo`/`writeIssue`, `try/finally` `cleanup`, and `countEvents`-based event assertions following the cardinality-pinning convention (`=== 1` for exactly-once events). The positive case changes only the deliverable path to a fresh untracked subdirectory; the lock case writes its only docs output into the excluded `docs/cycle/**` tree so the in-scope deliverable set is empty under the per-file scan but non-empty under the buggy whole-`docs/` collapse.

## Failure & Resilience Decisions

This cycle adds test code only; the new code has no production failure surface.

- **Task 1 / Task 2 (new test cases):** N/A — test code. The cases themselves are deterministic and self-contained: each creates its own temp git repo and temp bin dir via `setupRepo` (`mkdtemp` under `tmpdir()`), and removes both in a `finally` `cleanup`, so there is no cross-test ordering dependency and re-runs are independent. The *behavior under test* is the engine's existing doc-deliverable guard, whose failure semantics are already designed and unchanged:
  - **Failure modes (under test):** empty `src scripts tests` diff + `expects_code:false` + no in-scope `docs/**` deliverable ⇒ `r.status = "failed"`, `r.exitCode ||= 1`, `r.stderr = formatEmptyDiffGuardError(step.name)` (anti-slop). A `git status` non-zero leaves `docDeliverable = false` (relaxation withheld — never fabricates `ok`). An unreadable/missing issue file degrades to `expects_code = true` (guard fires). None of these paths is weakened by this cycle; Task 2 asserts the no-deliverable `failed` outcome directly.
  - **Idempotency:** test runs allocate unique temp dirs per invocation; nothing global is mutated. Safe to re-run.
  - **Observability:** assertions read `.cycle/log.jsonl` and count `step.end`, `cycle.end`, and `cycle.noop` events — the same structured events the engine already emits. A regression surfaces as a named, failing assertion in `npm test`.
  - **No silent failure:** every assertion uses `node:assert` (strict) with an explanatory message; a mis-routed cycle (e.g. flag removed) produces a non-zero `npm test` exit, not a swallowed pass.

---

## Task 1: Positive case — deliverable in a brand-new untracked subdirectory resolves `ok`

### Overview
Add a case proving the flag-enabled per-file scan correctly recognizes a real doc deliverable that lives in a previously-nonexistent untracked subdirectory (`docs/adr/0001.md`), completing the cycle as a normal `ok` (committed via `commitCycle`), not a `cycle.noop`. Covers AC1, AC3, and the CONCRETE USER BENEFIT (a doc-only cycle whose deliverable lives in a freshly-created untracked subtree still commits `ok`).

### Changes Required
**File**: `tests/engine/empty-diff-guard.test.ts`
**Changes**: Append a new `test(...)` after the final case (`:336`), mirroring `:224`–`271` and changing only the deliverable to a fresh subtree:

```ts
test("expects_code:false: deliverable in a brand-new untracked subdir -> ok (committed, no noop)", async () => {
  // The sole deliverable lives in a previously-nonexistent untracked subtree
  // (docs/adr/). With --untracked-files=all the scan sees the real file path
  // (docs/adr/0001.md) and relaxes the empty-diff guard to a normal ok.
  const fakeBody = [
    SHEBANG,
    "mkdir -p docs/adr",
    'printf "decision record\\n" > docs/adr/0001.md',
    'printf "## summary\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    await writeIssue(root, "EDG-OPTOUT-SUBDIR", "expects_code: false");
    const r = await runCycle(root, {
      issueId: "EDG-OPTOUT-SUBDIR",
      title: "doc-only opt-out untracked subdir",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "ok"),
      1,
      "step.end build ok must fire exactly once",
    );
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "failed"),
      0,
      "build step must not fail",
    );
    assert.equal(
      countEvents(log, e => e.event === "cycle.end" && e.status === "ok"),
      1,
      "cycle.end ok must fire exactly once",
    );
    assert.equal(
      countEvents(log, e => e.event === "cycle.noop"),
      0,
      "relaxed path must not emit cycle.noop (drains via commitCycle, not noopDrain)",
    );
    // The untracked-subtree deliverable is left in the tree for the commit path.
    assert.equal((await readFile(join(root, "docs/adr/0001.md"), "utf8")).trim(), "decision record");
  } finally {
    await cleanup(root, bin);
  }
});
```

### Success Criteria
- [ ] Builds/strips cleanly under `node --experimental-strip-types`.
- [ ] The new case passes against current `src/engine/run-cycle.ts`.
- [ ] Asserts `r.status === "ok"`, exactly one `step.end build ok`, zero `step.end build failed`, exactly one `cycle.end ok`, zero `cycle.noop`, and the deliverable content survives.
- [ ] Self-contained: own temp repo/bin, `try/finally` cleanup, no ordering dependency.
- [ ] Failure paths behave as designed (no error swallowed; a regression surfaces as a failing `node:assert`).

---

## Task 2: Discriminating lock case — no in-scope deliverable resolves `failed` (flips when the flag is removed)

### Overview
Add the executable regression lock the SPEC's USABLE END-STATE promises (AC4). The fake agent creates a brand-new untracked subtree whose only content is **excluded** (under the per-cycle `docs/cycle/**` artifact tree), so the in-scope deliverable set is empty under the per-file scan. With `--untracked-files=all` the scan correctly finds no in-scope deliverable → `failed`; without the flag the whole-`docs/` collapse `?? docs/` is mis-kept as a deliverable → `ok`, breaking the assertion. A comment ties the case to the flag at `run-cycle.ts:810`. This is distinct from the pre-existing anti-slop case `:273` (which writes nothing under `docs/`) in that it deliberately creates a brand-new untracked subtree, pinning the *bare-directory mis-read* mechanism named in the SPEC.

### Changes Required
**File**: `tests/engine/empty-diff-guard.test.ts`
**Changes**: Append a second `test(...)` after Task 1's case:

```ts
test("expects_code:false: untracked subtree with no in-scope deliverable -> failed (locks --untracked-files=all)", async () => {
  // Regression lock for cycle 0046's --untracked-files=all flag at
  // run-cycle.ts:810. The agent's only docs output goes into a brand-new
  // untracked subtree UNDER docs/cycle/** (excluded from the in-scope
  // deliverable set), so there is no legitimate deliverable. With the flag the
  // per-file scan correctly reports none -> empty-diff guard fires (failed).
  // WITHOUT the flag, the wholly-untracked docs/ tree collapses to a single
  // "?? docs/" porcelain entry that parseDocDeliverablePaths mis-keeps as
  // ["docs/"], wrongly relaxing the guard to ok -- which would flip this
  // assertion. Removing the flag therefore fails this test.
  const fakeBody = [
    SHEBANG,
    "mkdir -p docs/cycle/scratch",
    'printf "scratch\\n" > docs/cycle/scratch/note.md',
    'printf "## summary\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    await writeIssue(root, "EDG-OPTOUT-NOSCOPE", "expects_code: false");
    const r = await runCycle(root, {
      issueId: "EDG-OPTOUT-NOSCOPE",
      title: "opt-out untracked subtree no in-scope deliverable",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.equal(
      countEvents(log, e => e.event === "step.end" && e.step === "build" && e.status === "failed"),
      1,
      "step.end build failed must fire exactly once",
    );
    assert.equal(
      countEvents(log, e => e.event === "cycle.end" && e.status === "ok"),
      0,
      "guard must fire: no cycle.end ok when the flag is present",
    );
    assert.match(log, /build post-condition failed/);
  } finally {
    await cleanup(root, bin);
  }
});
```

### Success Criteria
- [ ] Builds/strips cleanly under `node --experimental-strip-types`.
- [ ] Passes against current code: `r.status === "failed"`, `failingStep === "build"`, exactly one `step.end build failed`, zero `cycle.end ok`, log matches `/build post-condition failed/`.
- [ ] **Discriminating (verified manually during build):** temporarily remove `--untracked-files=all` from `run-cycle.ts:810`, run `node --experimental-strip-types --test tests/engine/empty-diff-guard.test.ts`, confirm THIS case fails (outcome flips to `ok`), then restore the flag and confirm the suite is green again.
- [ ] Self-contained: own temp repo/bin, `try/finally` cleanup, no ordering dependency.
- [ ] No error swallowed; regression surfaces as a failing `node:assert` and non-zero `npm test` exit.

---

## Task 3: Verify full suite, coverage, and typecheck

### Overview
Confirm the two new cases pass within the full suite, coverage floors are unaffected (test-only change), and there are no compiler warnings.

### Changes Required
No file changes. Run:
- `npm test` — full suite (auto-builds first); both new cases green, all existing cases green.
- `npm run test:coverage` — confirm `src/engine/run-cycle.ts` stays ≥ 90% (no production change; floors unaffected per SPEC) and `check:coverage` / `check:invariants` pass.
- `npm run typecheck` — `tsc --noEmit`, no warnings.
- Manual discriminating check from Task 2's success criteria (remove flag → Task 2 fails → restore flag → green).

### Success Criteria
- [ ] `npm test` passes (existing + 2 new cases).
- [ ] `npm run test:coverage` passes; coverage floors not decreased.
- [ ] `npm run typecheck` reports no warnings.
- [ ] Manual flag-removal confirms Task 2 flips to failing and the flag is restored (tree clean: `git diff --stat src/engine/run-cycle.ts` empty).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A new integration case exists in `tests/engine/empty-diff-guard.test.ts` whose sole doc deliverable is written to a brand-new, fully untracked subdirectory (e.g. `docs/adr/0001.md`).` | Task 1 | Deliverable at `docs/adr/0001.md` in a fresh untracked subtree. |
| `[ ] **User-observable benefit:** running `npm test` passes with the new case green against the current `src/engine/run-cycle.ts`.` | Task 1, Task 2, Task 3 | Both new cases pass against current code; verified in the full suite. |
| `[ ] The new case asserts the cycle outcome is `ok` (docs committed via `commitCycle`) and that no `cycle.noop` / `noopDrain` path was taken.` | Task 1 | Asserts `r.status === "ok"`, exactly one `cycle.end ok`, zero `cycle.noop`. |
| `[ ] **Failure-path / discriminating criterion:** with `--untracked-files=all` removed from the doc-deliverable scan in `src/engine/run-cycle.ts`, the new case fails (it does not stay green) — confirming the scan would otherwise mis-read the untracked subtree as a bare `?? docs/` entry and mis-route the cycle.` | Task 2 | Empirically proven: a deliverable-present case (Task 1 / existing `:224`) is **non-discriminating** (stays `ok` both modes), so the discriminating lock is delivered by Task 2's no-in-scope-deliverable case, which flips `failed`→`ok` when the flag is removed. Manual flag-removal verification in Task 2 / Task 3. |
| `[ ] All existing tests still pass (`npm test`).` | Task 3 | Full suite run; existing cases (incl. anti-slop `:273`) unchanged and green. |
| `[ ] No compiler/linter warnings introduced (`npm run typecheck`).` | Task 3 | `tsc --noEmit`, no warnings. |

---

## Testing Strategy

### Unit Tests
- Not applicable beyond the two integration cases — this cycle adds no production unit. `parseDocDeliverablePaths`/`resolveExpectsCode` already have unit coverage and are unchanged.

### Integration / E2E Tests
- **Happy path (Task 1):** `expects_code:false` + empty `src scripts tests` diff + sole deliverable at `docs/adr/0001.md` (brand-new untracked subdir) → cycle resolves `ok`, committed, no `cycle.noop`.
- **Discriminating regression (Task 2):** `expects_code:false` + empty code diff + brand-new untracked subtree with only an excluded (`docs/cycle/**`) file → cycle resolves `failed` with `build post-condition failed`. Manually verified to flip to `ok` (test failure) when `--untracked-files=all` is removed from `run-cycle.ts:810`, then restored.
- **Failure-path scenarios exercised:** no-in-scope-deliverable → `failed` (Task 2, the anti-slop path the flag protects). Existing cases continue to cover `git status` failure (relaxation withheld) and unreadable/missing issue → `expects_code` defaults `true` (`:300`) — not weakened.
- **Negative-control reliance:** existing top-level `docs/RFC-x.md` cases (`:224`) remain green, confirming the new cases add discriminating coverage rather than duplicating it.
- **Mocking strategy:** none beyond the established fake-`claude` executable on `PATH` (real `git`, real temp repos, real `runCycle`). No `mock.method`; consistent with the file's existing anti-mock approach.

## Risk Assessment
- **SPEC internal inconsistency (AC1/AC3 vs AC4):** A single case cannot both assert `ok` with a deliverable present and fail when the flag is removed (proven empirically). *Mitigation:* split into two minimal cases mapped separately in the traceability table; rationale documented in "Current State" and "Implementation Approach". The `review` step traces against the six numbered Acceptance Criteria, all of which are covered.
- **Task 2 perceived as a duplicate of the existing anti-slop case (`:273`):** *Mitigation:* Task 2 deliberately creates a brand-new untracked subtree (vs. `:273` writing nothing under `docs/`) and is explicitly named/commented as the flag lock, converting an incidental property of `:273` into an intentional, documented guarantee — the SPEC's stated goal ("rather than an undocumented implementation detail"). Existing case `:273` is left untouched (Out of Scope).
- **Flag-removal verification leaves the tree dirty:** *Mitigation:* the manual check edits `run-cycle.ts:810` then restores it; Task 3 confirms `git diff --stat src/engine/run-cycle.ts` is empty before completion (the anti-slop/residue guards would otherwise catch a stray production diff).
- **Whole-`docs/` collapse depends on `docs/` being wholly untracked in the test repo:** confirmed — `setupRepo` makes an empty init commit and tracks nothing under `docs/`, so normal-mode porcelain collapses to `?? docs/` exactly as the discrimination requires.
