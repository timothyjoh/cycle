# Implementation Plan: Cycle 0049

## Overview
Add one count-based entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` that statically pins the codex lane's `exec` subcommand argv construction in `src/engine/exec-codex.ts`, plus an in-process `runInvariants`-driven test, converting the existing runtime-only protection into a build-time regression guard.

## Current State (from Research)
- `src/engine/exec-codex.ts:11` constructs `const argv: string[] = ["exec"];` — the exact text the new invariant pins. The functional fix already shipped (commit `c341b6d`); no production behavior changes here.
- `scripts/structural-invariants.mjs:139-144` holds the adjacent `CYCLE_CODEX_BIN` count-based invariant `{ file, pattern, expected, reason }` — the convention to mirror. The new entry sits in the same `src/engine/exec-codex.ts` group.
- Count-based dispatch counts `(text.match(pattern) ?? []).length` and FAILs when `actual !== expected` (`scripts/structural-invariants.mjs:249-258`); patterns carry the global `/…/g` flag.
- `runInvariants(invariants, cwd)` and `INVARIANTS` are importable; the module is import-safe (gate runs only under the `import.meta` CLI main guard) — `scripts/structural-invariants.mjs:214-267`, `:270`.
- The `.mjs` is `// @ts-check` with a co-located `@typedef Invariant` (`scripts/structural-invariants.mjs:30-42`); a new entry must satisfy `{ file: string, reason: string, pattern?: RegExp, expected?: number }` or `npm run typecheck` fails.
- `tests/scripts/structural-invariants.test.ts` has three relevant styles: subprocess CLI runs against a `setup()`-built temp tree, in-process `runInvariants` with `captureConsoleError()`, and real-repo regression pins (`run(process.cwd())`, exit 0).
- **Critical coupling**: `setup()` (`tests/scripts/structural-invariants.test.ts:31-36`) writes a stub `src/engine/exec-codex.ts` containing **only** the `CYCLE_CODEX_BIN` line. A new `["exec"]` pattern with `expected: 1` would FAIL against that stub (got 0), breaking every existing CLI-fixture test, unless the stub is extended.

## Desired End State
- `INVARIANTS` contains a codex-`exec` entry; `npm run check:invariants` exits 0 against the current tree.
- Removing/altering the `["exec"]` argv construction in `exec-codex.ts` makes `npm run check:invariants` exit non-zero with a `FAIL` line naming `src/engine/exec-codex.ts` and the reason.
- `tests/scripts/structural-invariants.test.ts` gains: (a) a happy-path case importing real `INVARIANTS`/`runInvariants` asserting the codex-`exec` invariant is present and passes against the real repo file; (b) a failure-path case feeding a synthetic bare-`codex` argv through `runInvariants` and asserting failure count ≥ 1.
- `setup()`'s codex stub is extended so all existing CLI-fixture tests stay green.
- `npm test`, `npm run typecheck`, and `tests/engine/exec-codex.test.ts` all pass unchanged.
- Verify: `npm run check:invariants` (exit 0), `npm test` (green), and a manual `git stash`-free mutation check encoded as the failure-path test.

## What We're NOT Doing
- No change to `src/engine/exec-codex.ts` behavior, argv, or the `thinking`→`reasoning_effort` mapping.
- No change to `docs/models.md`.
- No audit/change of the gemini / auggie / opencode / pi lanes for the same hazard (deferred per SPEC).
- No opt-in real-`codex` smoke test.
- No change to the CLI exit-code contract (0/1/2) or the script's stdout/stderr format.
- No new `setup()`-targeted invariant beyond the single codex-`exec` entry.

## Implementation Approach
Mirror the adjacent `CYCLE_CODEX_BIN` count-based invariant exactly. Anchor the `pattern` on the **full** construction `const argv: string[] = ["exec"]` rather than the bare `["exec"]` literal — this is regression-specific (a refactor to `const argv: string[] = []` or `[]` followed by a later `push("exec")` that drops the literal will fail) and unambiguous within the file. Resolve the brittleness concern by also extending the `setup()` codex stub to include that exact line, so the pattern is satisfied wherever the real construction lives. The test additions use the existing in-process and real-repo styles — no new fixture files needed; the failure-path test passes a synthetic invariants array (or temp file) directly to `runInvariants`.

**Open questions resolved:**
- *Pattern tightness*: use `/const argv: string\[\] = \["exec"\]/g` (escapes `[`, `]`, `"`). Regression-specific, matches the real construction once, does not match a bare-`codex` argv omitting `exec`.
- *setup() stub vs. expectations*: extend the `setup()` codex stub to append `const argv: string[] = ["exec"];` so existing CLI-fixture tests stay at exit 0. Chosen over loosening the pattern because it keeps the guard regression-specific.
- *Documentation clause*: add the optional single clause to CLAUDE.md's codex lane architecture bullet noting the `exec` subcommand is now build-time-pinned. No new section, no `docs/models.md` change.

## Failure & Resilience Decisions

**Task 1 (add invariant entry)** — N/A — pure declarative data. The entry is a literal object in the `INVARIANTS` array; it performs no I/O itself. The *runner* that consumes it already has its failure semantics fixed and unchanged (count mismatch → `console.error` FAIL + `failed++`; unreadable file → tagged error exit 2; malformed entry → FAIL, never silent pass — `scripts/structural-invariants.mjs:219-264`). This task introduces no new code path, swallow, or fallback. **No silent failure**: a count divergence surfaces as a stderr `FAIL` line and non-zero CLI exit; the SPEC failure requirement is met by the unchanged runner.

**Task 2 (extend `setup()` stub)** — failure modes: the stub write uses the existing `writeFile` inside `setup()`; a write failure rejects the test's async `setup()` call and fails the test loudly (no catch). Idempotency: `setup()` runs against a fresh `mkdtemp` temp tree per test and is fully overwrite-based — re-runs are safe. Observability: a failed write throws into `node:test`, reported as a failing test. No silent failure: no try/catch is added.

**Task 3 (tests)** — failure modes: `runInvariants` console output is captured via the existing `captureConsoleError()` with a `finally`-guaranteed `restore()`; temp trees use `mkdtemp` + `try/finally rm`. Idempotency: each test builds and tears down its own temp dir; real-repo pins are read-only. Observability/no silent failure: assertions fail the test on mismatch; no errors swallowed.

**Task 4 (docs clause)** — N/A — pure (CLAUDE.md edit, no runtime surface).

---

## Task 1: Add the codex-`exec` count-based invariant

### Overview
Register a single count-based entry pinning the `exec` subcommand argv construction in `src/engine/exec-codex.ts`, placed in the same `src/engine/exec-codex.ts` group as the existing `CYCLE_CODEX_BIN` invariant.

### Changes Required
**File**: `scripts/structural-invariants.mjs`
**Changes**: Insert immediately after the existing codex `CYCLE_CODEX_BIN` entry (`scripts/structural-invariants.mjs:144`):

```js
  // --- Codex non-interactive subcommand pin (cycle 0049) ---
  // The codex lane MUST invoke `codex exec …`, not bare `codex`: bare codex is
  // the interactive TUI and rejects a piped (non-TTY) stdin with
  // "Error: stdin is not a terminal" on codex-cli >= 0.136. A refactor that
  // drops the "exec" argv element reverts the lane to bare codex and breaks
  // codex-based downstream repos. The runtime unit assertion lives behind the
  // same fake-binary harness that hid the original bug; this is the durable
  // build-time guard.
  {
    file: 'src/engine/exec-codex.ts',
    pattern: /const argv: string\[\] = \["exec"\]/g,
    expected: 1,
    reason: 'codex lane invokes `codex exec` (bare codex fails on non-TTY stdin)',
  },
```

### Success Criteria
- [ ] `npm run typecheck` clean (entry conforms to `@typedef Invariant`; `pattern` is a `RegExp`, `expected` a number).
- [ ] `npm run check:invariants` exits 0 against the current tree (real `exec-codex.ts:11` matches exactly once).
- [ ] `node scripts/structural-invariants.mjs` emits an `ok -- src/engine/exec-codex.ts … : 1` line for the new reason.
- [ ] Failure paths behave as designed: a count divergence routes through the unchanged FAIL/exit-non-zero path; no new swallow added.

---

## Task 2: Extend the `setup()` codex stub so existing CLI-fixture tests stay green

### Overview
The new `expected: 1` pattern is evaluated against the stub `src/engine/exec-codex.ts` that `setup()` writes for every CLI-fixture subprocess test. The current stub contains only the `CYCLE_CODEX_BIN` line, so the new pattern would report `got 0` and flip those tests to exit 1. Append the `["exec"]` construction to the codex stub.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`
**Changes**: In the `lanes` loop (`tests/scripts/structural-invariants.test.ts:31-36`), special-case codex so its stub also carries the pinned argv line. For example:

```js
  for (const [file, env, bin] of lanes) {
    const execLine = file === "codex"
      ? `const argv: string[] = ["exec"];\n`
      : "";
    await writeFile(
      join(cwd, `src/engine/exec-${file}.ts`),
      `${execLine}const binary = process.env.CYCLE_${env}_BIN ?? "${bin}";\n`,
    );
  }
```

### Success Criteria
- [ ] All existing subprocess CLI-fixture tests (`violation`, `clean`, `cli` pass/fail, `residue` pass/fail) still exit 0/1 as before.
- [ ] `npm test` green (no regression from the stub change).
- [ ] Failure paths behave as designed: a stub write failure throws into the failing test, not swallowed.

---

## Task 3: Add happy-path and failure-path tests for the new invariant

### Overview
Add two cases to `tests/scripts/structural-invariants.test.ts`: a happy-path assertion that the codex-`exec` invariant is present in the real `INVARIANTS` and passes against the real `exec-codex.ts`, and a failure-path assertion that a synthetic bare-`codex` argv drives `runInvariants` to a failure count ≥ 1.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`
**Changes**: Extend the existing `runInvariants` import to also import `INVARIANTS`:

```js
import { runInvariants, INVARIANTS } from "../../scripts/structural-invariants.mjs";
```

Add a happy-path case (present-and-passing against the real repo):

```js
test("structural-invariants: codex-exec invariant is present and passes against real exec-codex.ts", async () => {
  const entry = INVARIANTS.find(
    (i) => i.file === "src/engine/exec-codex.ts"
      && i.reason.includes("codex exec"),
  );
  assert.ok(entry, "codex-exec invariant must be registered");
  const cap = captureConsoleError();
  let failed;
  try {
    failed = await runInvariants([entry], process.cwd());
  } finally {
    cap.restore();
  }
  assert.equal(failed, 0);
});
```

Add a failure-path case (synthetic bare-`codex` argv via a temp file driven by the real entry's pattern):

```js
test("structural-invariants: codex-exec invariant fails when the exec argv element is removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-codex-exec-fail-"));
  try {
    await mkdir(join(root, "src/engine"), { recursive: true });
    // Synthetic bare-`codex` lane: argv omits the "exec" element.
    await writeFile(
      join(root, "src/engine/exec-codex.ts"),
      `const argv: string[] = [];\nconst binary = process.env.CYCLE_CODEX_BIN ?? "codex";\n`,
    );
    const entry = INVARIANTS.find(
      (i) => i.file === "src/engine/exec-codex.ts" && i.reason.includes("codex exec"),
    );
    assert.ok(entry);
    const cap = captureConsoleError();
    let failed;
    try {
      failed = await runInvariants([entry], root);
    } finally {
      cap.restore();
    }
    assert.ok(failed >= 1);
    assert.ok(cap.lines.some((l) => l.includes("src/engine/exec-codex.ts")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Happy-path test passes: the entry is found and `runInvariants([entry], process.cwd())` returns 0.
- [ ] Failure-path test passes: the synthetic bare-`codex` tree returns failure count ≥ 1 with a stderr `FAIL` line naming `src/engine/exec-codex.ts`.
- [ ] `captureConsoleError()` is restored in `finally`; temp tree removed in `finally`.
- [ ] `tests/engine/exec-codex.test.ts` (incl. the `/^exec\b/` assertion) unchanged and green.
- [ ] `npm test` green.

---

## Task 4: Optional one-clause CLAUDE.md note

### Overview
Add a single clause to CLAUDE.md's codex lane architecture bullet noting the `exec` subcommand is now build-time-pinned by a structural invariant. No new section.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: In the registered-step-agents paragraph, amend the `codex` clause from `CYCLE_CODEX_BIN overrides binary for tests` to additionally note: `… ; the `exec` subcommand is build-time-pinned by a structural invariant`. Single clause, no structural change.

### Success Criteria
- [ ] CLAUDE.md codex clause mentions the build-time pin in one clause.
- [ ] No new section added; no `docs/models.md` change.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] npm run check:invariants exits 0 against the current tree (the new invariant passes because exec-codex.ts already begins its argv with "exec").` | Task 1 | Pattern matches `exec-codex.ts:11` once; `expected: 1`. |
| `[ ] A maintainer who removes the "exec" argv element from src/engine/exec-codex.ts causes npm run check:invariants to exit non-zero with a FAIL line naming src/engine/exec-codex.ts — verified by a test that feeds a synthetic bare-codex argv (or temporarily mutated text) through runInvariants and asserts the returned failure count is ≥ 1. (failure-path + user-observable-benefit criterion)` | Task 3 | Failure-path test feeds `const argv: string[] = []` and asserts `failed >= 1` + stderr names the file. |
| `[ ] tests/scripts/structural-invariants.test.ts gains a case importing the real INVARIANTS/runInvariants exports that asserts the codex-exec invariant is present and passes against the real repo file.` | Task 3 | Happy-path test imports `INVARIANTS`, finds the entry, asserts `runInvariants([entry], cwd) === 0`. |
| `[ ] The existing codex unit tests in tests/engine/exec-codex.test.ts still pass unchanged.` | Task 1, Task 3 | No production-code or codex-test change; verified by `npm test`. |
| `[ ] All existing tests still pass (npm test).` | Task 2, Task 3 | `setup()` stub extension keeps CLI-fixture tests green; full suite verified. |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean; the .mjs JSDoc @ts-check annotations remain valid).` | Task 1 | Entry conforms to `@typedef Invariant`; `npm run typecheck` verified. |

---

## Testing Strategy

### Unit Tests
- **Happy path**: codex-`exec` entry present in real `INVARIANTS`; `runInvariants([entry], process.cwd())` returns 0 against the real `exec-codex.ts` (Task 3).
- **Failure path**: synthetic temp `exec-codex.ts` with `const argv: string[] = []` (bare codex, no `exec` element) → `runInvariants` returns ≥ 1 and emits a stderr `FAIL` line naming the file (Task 3). This is the named failure mode (count divergence → FAIL → non-zero exit).
- **Mocking strategy**: none beyond `captureConsoleError()` (already in the file). Real `runInvariants`/`INVARIANTS` exports and real filesystem temp trees — anti-mock bias honored.
- **Regression coverage of `setup()` change**: the existing subprocess CLI-fixture tests (`violation`, `clean`, `cli` pass/fail, `residue` pass/fail) re-run against the extended stub and must stay at their expected exit codes (Task 2).

### Integration / E2E Tests
- `npm run check:invariants` (= `node scripts/structural-invariants.mjs`) exits 0 against the real tree and emits the new `ok -- src/engine/exec-codex.ts …: 1` line — exercised by the existing real-repo regression pins (`tests/scripts/structural-invariants.test.ts:191-201`) which already gate exit 0 / empty stderr; the new entry must not perturb them.
- `npm test` full suite green (includes the unchanged `tests/engine/exec-codex.test.ts` runtime `/^exec\b/` assertion).

## Risk Assessment
- **Pattern too brittle to formatting** (e.g. a future refactor reflows `const argv: string[] = ["exec"]`): the pattern is anchored on the exact current construction. Mitigation: this is intentional regression-specificity; if the construction is legitimately reformatted, the invariant and the `setup()` stub are updated together in the same change — the FAIL is loud and self-explanatory via the `reason`.
- **`setup()` stub drift breaks existing CLI-fixture tests**: directly mitigated by Task 2, which extends the codex stub to satisfy the new pattern; verified by re-running the full subprocess-test set under `npm test`.
- **Pattern accidentally matching elsewhere in the file** (count > 1): the construction appears once in `exec-codex.ts`; `expected: 1` would catch any accidental duplication as a FAIL rather than a silent pass.
