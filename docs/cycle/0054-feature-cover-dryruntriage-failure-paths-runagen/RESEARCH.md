Have enough to write research doc.

```markdown
# Research: Cycle 0054

## Cycle Context
SPEC asks for two new `dryRunTriage`-entry-point tests in `tests/engine/triage-dry-run.test.ts` plus a minimal localized change in `src/engine/triage.ts` to wrap the `dryRunTriage` prompt-template `readFile` in a `try/catch` that re-throws as `prompt template missing: <resolved-path>: <cause>`. Goal: pin the two failure shapes — (A) `runAgent` throws mid-attempt, (B) prompt template file absent — that today are reached only via shared coverage with `runTriage`. Coverage gate `src/engine/triage.ts ≥ 95%` must hold; aggregate floors must not regress.

## Current Codebase State

### Relevant Components

- **`dryRunTriage` entry point** — `src/engine/triage.ts:253-301`. No `Logger` argument, no filesystem mutations, no `bootstrapArchiveIfLegacy`, no `mkdir(rawDir)`. Returns `DryRunReport[]` (one row per raw). Tolerates missing `raw/` via `loadRaws` (returns `[]` and the function returns early at `triage.ts:261`).
- **Prompt template read site (dry-run)** — `src/engine/triage.ts:263-266`. Unwrapped `await readFile(join(repoRoot, ".cycle", cfg.triage.prompt), "utf8")`. ENOENT propagates as the bare Node error (`code: 'ENOENT'`, `message: "ENOENT: no such file or directory, open '<path>'"`). This is the Case B touch site.
- **`runAgent` failure catch** — `src/engine/triage.ts:113-119` inside `processRawWithRetry`. `try { agentResult = await ctx.runAgent(...) } catch (e) { lastError = \`agent failed: ${(e as Error).message}\`; ... continue; }`. Shared between `runTriage` and `dryRunTriage` (both pass through `processRawWithRetry`). Loop runs up to `MAX_ATTEMPTS = 3` (`triage.ts:88`). Case A's `last_error` shape: `agent failed: <inner.message>`.
- **`processRawWithRetry` retry budget** — `src/engine/triage.ts:90-155`. `attemptsRun` counter increments per iteration; final failed `RawAttemptOutcome` shape is `{ status: "failed", lastError, attempts: attemptsRun }`. `dryRunTriage` clones the raw with `attempts: 0` (`triage.ts:274`) so prior on-disk `triage_attempts` does not shrink the dry-run budget — `attempts: 3` is the locked shape when all attempts exhaust.
- **`DryRunReport` shape** — `src/engine/triage.ts:80-86`. `{ raw_id, status: "ok" | "failed", attempts, last_error?, children? }`.
- **`TriageAgentRunner` injection seam** — `src/engine/triage.ts:23-31`. `TriageDeps = { runAgent?: TriageAgentRunner }`. Tests pass a `runAgent` stub. Default is `runAgentViaDispatch` at `triage.ts:699-716`.
- **CLI surface** — `src/cli/triage.ts:22-40`. `runCliTriage` calls `dryRunTriage` directly (no try/catch). A synchronous throw from `dryRunTriage` propagates to the CLI top-level handler, which maps to non-zero exit. No new mapping required.

### Existing Patterns to Follow

- **Tmp-repo test harness** — `tests/engine/triage-dry-run.test.ts:36-49` `setupRepo()`. Creates `mkdtemp`, scaffolds `.cycle/prompts/`, `docs/cycle/issues/{raw,todo,done,failed}/`, writes a minimal prompt template at `.cycle/prompts/triage.md` (template body: `RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}`). Tests `rm(root, { recursive: true, force: true })` in `finally`.
- **CycleConfig fixture** — `tests/engine/triage-dry-run.test.ts:22-34` `makeConfig()`. Minimal config with `triage: { agent: "claudecode", prompt: "prompts/triage.md", max_turns: 10 }`. Reuse directly.
- **Raw body fixture** — `tests/engine/triage-dry-run.test.ts:51-64` `rawBody(id, title, attempts=0)`. Frontmatter keys: `id`, `source: text`, `title`, `added_at`, `triage_attempts`. Note: SPEC §Testing Strategy mentions `workflow: feature`, `depends_on: []`, `triaged_at`, `source: reflection` — but the existing helper produces `source: text` and omits `workflow/depends_on/triaged_at`. The existing helper is what every passing test in the file uses; the planner should reuse `rawBody()` verbatim, not introduce a new shape.
- **Decompose JSON fixture** — `tests/engine/triage-dry-run.test.ts:66-91` `decomposeJson(rawId)`. Returns valid agent stdout for the happy path.
- **Filesystem-invariance assertions** — `tests/engine/triage-dry-run.test.ts:93-121` `dirHash()` and `fileBytes()`. Hashes a directory's contents (filename + body) and reads a file as bytes (returns `null` on `ENOENT`). The existing byte-identity test at `triage-dry-run.test.ts:232-303` is the canonical pattern for asserting the dry-run no-mutation contract — Case A's negative assertions should reuse this exact shape.
- **`assert.rejects` shape (Case B)** — `node:assert/strict`. Pattern from elsewhere in the suite: `await assert.rejects(promise, (e: Error) => /regex/.test(e.message))`. Case B test will use this against `dryRunTriage(...)`.
- **Sentinel `runAgent` stub** — `tests/engine/triage-dry-run.test.ts:316-320`. The empty-raw-dir test uses `async (): Promise<TriageAgentResult> => { throw new Error("runAgent must not be called for empty raw/"); }` as a guardrail. SPEC §Testing Strategy asks Case B to use the same shape (throw `"should never be called"`).
- **`UnknownAgentError` precedent** — `tests/engine/triage-dry-run.test.ts:391-410` already covers the synchronous-throw-via-`resolveAgent` path with `last_error` matching `/"other"/` and `/claudecode/`. Confirms the existing convention is to assert on `last_error` substrings, not error classes (per SPEC out-of-scope).

### Dependencies & Integration Points

- **`readFile` from `node:fs/promises`** — imported at `src/engine/triage.ts:2`. The site to wrap for Case B is `triage.ts:263-266`.
- **`join` from `node:path`** — used to construct the resolved prompt path `join(repoRoot, ".cycle", cfg.triage.prompt)`. The wrap must preserve this same resolution so the test can match the resolved absolute path.
- **`CycleConfig` / `TriageConfig`** — `src/engine/workflow.ts:26-36`. `triage.prompt` is a `.cycle/`-relative string; `triage.agent` is the registered agent name.
- **`TriageAgentResult`** — `src/engine/triage.ts:21`. `{ exitCode, stdout, stderr }`. Test stubs return this shape; Case A's stub throws instead.
- **No CLI changes** — `src/cli/triage.ts` already lets the synchronous throw propagate; the CLI top-level handler in `src/cli.ts` maps any uncaught throw to a non-zero exit.

### Test Infrastructure

- **Framework** — Node's built-in `node:test` with `node:assert/strict`. Run via `npm test` (uses `--experimental-strip-types` to run `.ts` directly; no transpile step). `pretest` rebuilds `dist/cycle.js`.
- **Test conventions** — One file per source module, named `<area>/<source>.test.ts` under `tests/`. Each `test(name, async () => { … })` mints its own `mkdtemp` root and cleans up in `finally`.
- **Coverage** — `npm run test:coverage` runs the native `--experimental-test-coverage` reporter, emits LCOV to `.cycle/coverage.lcov` (gitignored), and auto-invokes `scripts/coverage-gate.mjs` (`posttest:coverage`) to enforce `src/engine/triage.ts ≥ 95%`. Aggregate floors: line ≥ 95%, branch ≥ 75%, func ≥ 90%.
- **Current coverage of the change area** — `triage.ts:113-119` (runAgent catch) and `triage.ts:263-266` (prompt template read) are exercised today indirectly through `runTriage` tests, not through `dryRunTriage`-entry-point tests. The cycle's coverage gate (line ≥ 95% per-file) already holds; the new tests close the dry-run-specific coverage gap without changing the gate.

## Code References

- `src/engine/triage.ts:80-86` — `DryRunReport` interface (the row shape Case A asserts against).
- `src/engine/triage.ts:88` — `MAX_ATTEMPTS = 3` constant; locks Case A's `attempts: 3` assertion.
- `src/engine/triage.ts:113-119` — `try/catch` around `ctx.runAgent`; this is where `agent failed: <msg>` is produced (Case A path).
- `src/engine/triage.ts:253-301` — `dryRunTriage` body (entry point under test).
- `src/engine/triage.ts:263-266` — prompt-template `readFile` site to wrap for Case B.
- `src/engine/triage.ts:274` — `{ ...raw, attempts: 0 }` clone confirms dry-run runs full 3-attempt budget regardless of on-disk `triage_attempts`.
- `src/engine/triage.ts:699-716` — `runAgentViaDispatch` default runner (replaced by stub in tests).
- `src/cli/triage.ts:22-40` — `runCliTriage`; no try/catch around `dryRunTriage`, so a synchronous throw surfaces as a non-zero exit at the CLI top level.
- `tests/engine/triage-dry-run.test.ts:22-34` — `makeConfig()` helper to reuse.
- `tests/engine/triage-dry-run.test.ts:36-49` — `setupRepo()` helper. For Case B, the planner needs a variant that does NOT create `.cycle/prompts/triage.md` (or unlinks it after setup) — same scaffold otherwise.
- `tests/engine/triage-dry-run.test.ts:51-64` — `rawBody()` helper; canonical raw fixture shape (note `source: text`, not `source: reflection`).
- `tests/engine/triage-dry-run.test.ts:93-121` — `dirHash()` / `fileBytes()` helpers for negative assertions on filesystem state.
- `tests/engine/triage-dry-run.test.ts:232-303` — canonical byte-identity test; Case A's no-mutation assertions should mirror this pattern.
- `tests/engine/triage-dry-run.test.ts:316-320` — sentinel `runAgent` throw shape for guard-rail stubs (reuse for Case B).
- `tests/engine/triage-dry-run.test.ts:391-410` — precedent for asserting on `last_error` substrings (not error classes).
- `CLAUDE.md` (Commands table row for `cycle triage --dry-run`) — current contract text the planner extends with the documented Case A/B shapes.
- `src/defaults/prompts/triage.md` — production prompt template; not copied for Case B (the SPEC notes Case A only needs it for completeness, but the existing test harness writes a stub prompt and never reads the real one).

## Open Questions

1. **Resolved path shape for Case B assertion.** The Case B test must match the `<resolved-path>` token in `prompt template missing: <resolved-path>`. The current `readFile` argument is `join(repoRoot, ".cycle", cfg.triage.prompt)` — i.e., `<tmp>/.cycle/prompts/triage.md`. SPEC asserts `e.message.includes(resolvedPromptPath)` (the test computes the same `join(...)` independently). The planner should decide whether to use the literal `join(repoRoot, ".cycle", cfg.triage.prompt)` (matches today's behavior) or `resolve(...)` (canonicalizes symlinks/relative segments). Today the code uses `join`, which is sufficient — recommend keeping `join`.
2. **Error chaining: include `cause` or only message prefix?** SPEC's wrap shape is `prompt template missing: <resolved-path>: <cause>`. The planner can choose between `new Error(\`prompt template missing: ${path}: ${(e as Error).message}\`)` (flat message — what the test regex matches today) or `new Error(\`prompt template missing: ${path}\`, { cause: e })` (Node 16+ `cause` chain, ESM-friendly). SPEC's test regex `/^prompt template missing: /` matches both forms; the second preserves the original `ENOENT` `code` on `error.cause`. Recommend the flat-message form for assertion stability and to match the existing `agent failed: ${...message}` style at `triage.ts:116`.
3. **Should `setupRepo()` be parameterized or should Case B inline its own scaffolding?** The existing helper unconditionally writes `.cycle/prompts/triage.md`. Two options: (a) add a `{ withPrompt?: boolean }` parameter to `setupRepo()`; (b) Case B calls a small inline variant that mkdirs the same subdirs but omits the prompt write. Recommend option (b) — keeps `setupRepo()` shape stable for the eight existing tests that depend on it, and Case B is the only outlier.
4. **Where exactly to place the one-line intent comment.** SPEC requires "one-line comment placed adjacent to the wrapped `readFile` in `dryRunTriage` stating the Case B shape (top-level throw with `prompt template missing: <path>`) is intentional per the dry-run contract." Recommend placing it immediately above the `try { … } catch { … }` block, not inside the catch, so the intent reads at the call site rather than at the rethrow site.
```
