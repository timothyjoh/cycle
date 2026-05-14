```markdown
# Implementation Plan: Cycle 0056

## Overview
Split `src/cli/triage.ts` into a two-arg prod wrapper `runCliTriage(repoRoot, argv)` (no `deps` param) plus a three-arg `runCliTriageWithDeps(repoRoot, argv, deps)` carrying the full body. Migrate the two deps-injecting test cases to the new export; keep the deps-free cases on the wrapper so its delegation line stays covered. No engine, CLI-entry, or behavior change.

## Current State (from Research)
- `src/cli/triage.ts:22-40` defines a single `runCliTriage(repoRoot, argv, deps: TriageDeps = {})` — `deps` is optional with `{}` default. Body: help short-circuit, `--dry-run` gate, `loadConfig` → `dryRunTriage(repoRoot, cfg, deps)` → JSON-stringify, exit 1 on any `status:"failed"`.
- Prod call site: `src/cli.ts:57-63` — invokes `runCliTriage(process.cwd(), argv.slice(1))` with two args. Lazy-imported via dynamic `import()`.
- Test file `tests/cli/triage-handler.test.ts` has 6 tests. Two pass `deps` (lines 125-127 and 146-148); the other four (`--help`, `-h`, no flag, `--dry-run` empty `raw/`) call the two-arg form.
- `TriageDeps = { runAgent?: TriageAgentRunner }` is already exported from `src/engine/triage.ts:29-31`; `dryRunTriage` accepts `deps?: TriageDeps` and defaults `runAgent` to `runAgentViaDispatch` internally, so passing `{}` is byte-identical to passing nothing.
- Coverage: `src/cli/triage.ts` and `src/cli.ts` are not in the per-file `FLOORS` table; only the global aggregate gates them. SPEC requires no per-file regression vs master.

## Desired End State
- `src/cli/triage.ts` exports both `runCliTriage(repoRoot, argv)` (two-arg, no `deps` param at all — not optional, not defaulted) and `runCliTriageWithDeps(repoRoot, argv, deps: TriageDeps)` (three-arg, `deps` non-optional).
- The wrapper body is exactly `return runCliTriageWithDeps(repoRoot, argv, {});` — no conditionals, no construction logic.
- `src/cli.ts` is byte-identical to master (still calls `runCliTriage(process.cwd(), argv.slice(1))`).
- `tests/cli/triage-handler.test.ts` imports both functions; the two deps-injecting cases call `runCliTriageWithDeps`; the four deps-free cases continue to call `runCliTriage`. The empty-`raw/` `--dry-run` case covers the wrapper's delegation line.
- `npm run typecheck`, `npm test`, `npm run test:coverage`, and `npm run check:coverage` all exit 0. Per-file line coverage for `src/cli/triage.ts` and `src/cli.ts` is not worse than master.

**Verification:**
- `grep -nE "runCliTriage\(" src/` shows zero call sites passing a third argument.
- `git diff master -- src/cli.ts` is empty.
- All 6 existing test assertions pass unchanged (no `last_error` or `stdout` shape drift).

## What We're NOT Doing
- NOT reworking `TriageDeps`: shape stays `{ runAgent?: TriageAgentRunner }`. Fields stay optional; only the `deps` *parameter* on `runCliTriageWithDeps` is non-optional.
- NOT splitting `dryRunTriage` in `src/engine/triage.ts` (sibling raw `refl-0023-dry-run-untested-paths-runagent-throws-a` may follow this pattern in a later cycle).
- NOT touching `src/cli.ts` beyond keeping its existing single-line call green (it already is, no change required).
- NOT adding any new test files.
- NOT touching `tests/engine/triage*.test.ts`.
- NOT introducing factory helpers, "real-deps construction" logic, or future-proofing on the wrapper. Hardcoded `{}` per SPEC.
- NOT updating README.md / CLAUDE.md / AGENTS.md — internal-only split, no doc invariant moves.

## Implementation Approach
A single vertical slice: rename today's `runCliTriage` body to `runCliTriageWithDeps` with a required `deps: TriageDeps` parameter, then add a new thin two-arg `runCliTriage` that delegates with `{}`. Migrate the two deps-injecting tests in one pass and run typecheck + coverage to confirm green. Because the wrapper has no logic of its own and the body is lifted verbatim, behavior is preserved by construction — the test suite proves it.

### Resolved Open Questions (from RESEARCH)
1. **`deps` field-level optionality**: `TriageDeps` stays `{ runAgent?: TriageAgentRunner }` (fields optional). The `deps` parameter on `runCliTriageWithDeps` is required at the signature level. Tests pass `{ runAgent: ... }`; the wrapper passes `{}`.
2. **Wrapper body**: hardcoded `return runCliTriageWithDeps(repoRoot, argv, {});` — no conditionals, no factory.
3. **Wrapper coverage**: the empty-`raw/` `--dry-run` test (`tests/cli/triage-handler.test.ts:72-81`) is the load-bearing wrapper coverage — it reaches `runCliTriageWithDeps(..., {})` and through to `loadConfig` + `dryRunTriage`. The `--help` / `-h` / no-flag cases hit the wrapper as function entries (covering `function` metric) but return inside `runCliTriageWithDeps`'s early branches; they still count toward the wrapper's call coverage because the wrapper body is a single statement that always runs.

---

## Task 1: Split `src/cli/triage.ts` into wrapper + with-deps entry

### Overview
Replace the current single export with two exports: a body-bearing `runCliTriageWithDeps` (required `deps`) and a thin `runCliTriage` that delegates with `{}`.

### Changes Required

**File**: `src/cli/triage.ts`
**Changes**: Keep imports and `HELP` constant unchanged. Replace lines 22-40 with:

```ts
export async function runCliTriageWithDeps(
  repoRoot: string,
  argv: string[],
  deps: TriageDeps,
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { exitCode: 0, stdout: HELP + "\n" };
  }
  if (!argv.includes("--dry-run")) {
    return { exitCode: 2, stdout: "", stderr: HELP };
  }
  const cfg = await loadConfig(repoRoot);
  const reports = await dryRunTriage(repoRoot, cfg, deps);
  const anyFailed = reports.some((r) => r.status === "failed");
  return {
    exitCode: anyFailed ? 1 : 0,
    stdout: JSON.stringify(reports, null, 2) + "\n",
  };
}

export async function runCliTriage(
  repoRoot: string,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  return runCliTriageWithDeps(repoRoot, argv, {});
}
```

Key points:
- `runCliTriageWithDeps`'s `deps: TriageDeps` has NO `= {}` default — non-optional.
- `runCliTriage` has NO third parameter at all (not even optional). This is the compile-time guarantee.
- `TriageDeps` continues to be imported from `../engine/triage.ts` and is implicitly re-importable via the existing barrel-free path (test file imports it directly from `../../src/engine/triage.ts` if needed — not required for this cycle).
- Body of `runCliTriageWithDeps` is byte-identical to today's `runCliTriage` body (minus the `deps = {}` default).

### Success Criteria
- [ ] `npm run typecheck` exits 0.
- [ ] `grep -nE "runCliTriage\(" src/` shows the wrapper definition + the `src/cli.ts:59` call site; zero call sites pass three args.
- [ ] `grep -n "runCliTriageWithDeps" src/cli/triage.ts` shows the export and the wrapper's delegation line; no other `src/` reference.
- [ ] `git diff master -- src/cli.ts` is empty.

---

## Task 2: Migrate `tests/cli/triage-handler.test.ts` deps-injecting cases

### Overview
Update the test file's import and switch the two deps-injecting cases to `runCliTriageWithDeps`. Leave deps-free cases on `runCliTriage` (they exercise the wrapper).

### Changes Required

**File**: `tests/cli/triage-handler.test.ts`

**Change 1** — line 6, add the new import:

```ts
import { runCliTriage, runCliTriageWithDeps } from "../../src/cli/triage.ts";
```

**Change 2** — lines 125-127, swap the call in the `status:ok` test:

```ts
const result = await runCliTriageWithDeps(root, ["--dry-run"], {
  runAgent: async () => ({ exitCode: 0, stdout: decomposeJson("r1"), stderr: "" }),
});
```

**Change 3** — lines 146-148, swap the call in the `status:failed` test:

```ts
const result = await runCliTriageWithDeps(root, ["--dry-run"], {
  runAgent: async () => ({ exitCode: 0, stdout: "not json", stderr: "" }),
});
```

**Unchanged** — lines 36-81 (the four deps-free cases `--help`, `-h`, no-flag, `--dry-run` empty `raw/`) continue to call `runCliTriage(root, [...])`. The empty-`raw/` case is the load-bearing wrapper-delegation coverage; the other three exercise the wrapper's function entry.

### Success Criteria
- [ ] `npm test` exits 0; all 6 tests in `triage-handler.test.ts` pass.
- [ ] Assertions are unchanged (same exit codes, same `JSON.parse` shape, same `last_error` text and `stdout` shape on the failed-status case).
- [ ] No other test files modified.

---

## Task 3: Verify coverage + type safety end-to-end

### Overview
Run the full quality gate and confirm no per-file regression for `src/cli/triage.ts` or `src/cli.ts`. This task is gate-only — no code changes; it exists to make the cycle's done-state explicit.

### Changes Required
None. Run:

```sh
npm run typecheck
npm run test:coverage     # also auto-runs posttest:coverage = check:coverage
```

Read the spec reporter output for per-file line coverage on `src/cli/triage.ts` (expected ≥ master baseline) and `src/cli.ts` (expected unchanged: byte-identical file).

### Success Criteria
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:coverage` exits 0 with all tests green; aggregate line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] `npm run check:coverage` (run via `posttest:coverage`) exits 0 — `src/engine/triage.ts` line floor (≥ 95%) holds.
- [ ] Per-file line coverage for `src/cli/triage.ts` and `src/cli.ts` does not regress vs master baseline. Report numbers in `BUILD.md`.

---

## Testing Strategy

### Unit Tests
- The existing 6 tests in `tests/cli/triage-handler.test.ts` are the contract. No new tests; no removed tests; no new assertions. The split is internal — behavior is preserved by lifting the body verbatim.
- Mocking: the test suite already uses `runAgent` injection via `TriageDeps` — that's the intended seam. No new mocks. Prefer real `loadConfig` and real filesystem temp repos (already in place via `repo()` helper). No additional mocking introduced.
- Coverage rationale: the four deps-free cases hit the wrapper. The `--dry-run` empty-`raw/` case (line 72-81) exercises the wrapper's delegation line `return runCliTriageWithDeps(repoRoot, argv, {})` end-to-end through `loadConfig` + `dryRunTriage`. The two migrated cases drive `runCliTriageWithDeps` directly with stubbed `runAgent`.

### Integration / E2E Tests
- N/A. There is no UI surface and no shell-level CLI integration test for `cycle triage --dry-run` distinct from the handler tests. The `src/cli.ts:57-63` dispatch line is the only integration point and is unchanged.

## Risk Assessment

- **Risk**: Existing test imports break if `runCliTriage` signature change is mis-applied. **Mitigation**: deps-free tests must continue to compile with the new two-arg signature (no third arg). Typecheck + run tests in the same task.

- **Risk**: Coverage regresses on `src/cli/triage.ts` because the wrapper adds an additional function while the body's branch counts stay the same. **Mitigation**: the four deps-free tests cover wrapper entry; the empty-`raw/` test covers wrapper-to-with-deps delegation. Together they hit both functions on every relevant branch. If `check:coverage` flags a regression, add no new tests — instead investigate whether one of the existing four cases stopped exercising the wrapper (very unlikely given they all still call `runCliTriage`).

- **Risk**: `TriageDeps` field `runAgent?` being optional could let a caller pass `{}` and silently get the real implementation, defeating the test's intent. **Mitigation**: not a new risk — this is current behavior. The two migrated tests still pass `{ runAgent: ... }` explicitly, so the engine never reaches `runAgentViaDispatch` in those cases. Out of scope to tighten further.

- **Risk**: A future contributor adds a third arg to `src/cli.ts:59`. **Mitigation**: the new `runCliTriage` signature physically has only two parameters — TypeScript will reject the third arg at compile time. This is the entire point of the split; the SPEC's `grep` acceptance check provides a textual safety net.
```
