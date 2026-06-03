I have everything needed to write the research document.

```markdown
# Research: Cycle 0049

## Cycle Context
SPEC.md asks for a single, durable build-time regression guard that statically pins the codex lane's `exec` subcommand. The functional fix already shipped (commit `c341b6d`): `src/engine/exec-codex.ts` builds an argv beginning with the literal `"exec"` and maps `thinking` to `-c model_reasoning_effort`. The only remaining gap from the source issue's *"Close the blind spot"* section is that the sole protection against a regression to bare `codex` is a runtime unit assertion in `tests/engine/exec-codex.test.ts` (which lives behind the same fake-binary harness that hid the original bug). This cycle adds one count-based entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` asserting `exec-codex.ts` initializes its argv with `["exec"]`, plus a test in `tests/scripts/structural-invariants.test.ts` driving it through the importable `runInvariants` export. No production behavior, codex tests, or docs are changed (other than an optional one-clause note).

## Current Codebase State

### Relevant Components
- Codex exec lane (the file the new invariant pins): builds `const argv: string[] = ["exec"]`, pushes `--model`/`-c model_reasoning_effort`, resolves binary via `CYCLE_CODEX_BIN ?? "codex"` — `src/engine/exec-codex.ts:11`, `:12`, `:15`, `:20`.
- Structural-invariants checker (where the new entry goes): module with `INVARIANTS` table and `runInvariants(invariants, cwd)` export — `scripts/structural-invariants.mjs:79`, `:214`.
- Adjacent codex `CYCLE_CODEX_BIN` hermeticity invariant (the convention to mirror): `scripts/structural-invariants.mjs:139-144`.
- Structural-invariants test (where the new test case goes) — `tests/scripts/structural-invariants.test.ts:1`.
- Existing codex runtime unit tests (must stay green, including the `/^exec\b/` assertion) — `tests/engine/exec-codex.test.ts:89`.

### Existing Patterns to Follow
- **Count-based invariant entry shape**: each entry is `{ file, pattern, expected, reason }`; the runner counts `(text.match(entry.pattern) ?? []).length` and FAILs when `actual !== entry.expected`. The `pattern` must carry the global flag (`/…/g`) so `String.match` returns all occurrences — every count-based entry in the table uses `/…/g` (e.g. `scripts/structural-invariants.mjs:135`, `:141`). Dispatch and counting at `scripts/structural-invariants.mjs:249-258`.
- **Adjacent codex invariant** (the SPEC names this as the model): `{ file: 'src/engine/exec-codex.ts', pattern: /process\.env\.CYCLE_CODEX_BIN \?\? "codex"/g, expected: 1, reason: 'codex lane resolves binary via CYCLE_CODEX_BIN override' }` — `scripts/structural-invariants.mjs:139-144`. The new entry sits naturally next to it in the same `src/engine/exec-codex.ts` group.
- **Regex escaping for literal argv text**: the pinned construction is `const argv: string[] = ["exec"];` (`src/engine/exec-codex.ts:11`). A pattern matching it must escape `[`, `]`, and `"` (e.g. `/\["exec"\]/g` or a tighter anchor including `const argv`). The adjacent override pattern demonstrates escaping `.`, `?`, and `"` literally (`scripts/structural-invariants.mjs:141`).
- **Test conventions for invariants** — two complementary styles already in the test file:
  - *Subprocess/CLI* via `run(cwd)` → `spawnSync(process.execPath, [SCRIPT], …)` against a temp tree built by `setup()` (`tests/scripts/structural-invariants.test.ts:42`, `:14`). `setup()` already writes a stub `src/engine/exec-codex.ts` containing only the `CYCLE_CODEX_BIN` line (`tests/scripts/structural-invariants.test.ts:31-36`) — a new pattern pinning `["exec"]` would FAIL against that stub unless the stub string is extended.
  - *In-process* via the imported `runInvariants` export with a synthetic invariants array and a `captureConsoleError()` helper (`tests/scripts/structural-invariants.test.ts:7`, `:149`, `:140`). The SPEC's failure-path criterion (feed a synthetic bare-`codex` argv / mutated text and assert failure count ≥ 1) maps directly onto this in-process style.
  - *Real-repo regression pin*: `run(process.cwd())` asserting `status === 0` and empty stderr (`tests/scripts/structural-invariants.test.ts:197-201`); a sibling asserts a specific `ok --` stdout line (`:191-195`). The happy-path acceptance criterion (invariant present and passing against the real file) fits this pattern.
- **Failure handling (existing, must be preserved)**:
  - Unreadable target file → tagged `Error` with `exitCode = 2`, emits `structural-invariants: cannot read <file>` and rethrows; CLI maps to exit 2 (`scripts/structural-invariants.mjs:219-227`, `:274-277`). No new swallow path is to be added.
  - Count mismatch → `console.error("… FAIL <file> -- <reason>: expected <e>, got <a>")`, `failed++` (`scripts/structural-invariants.mjs:251-254`).
  - Malformed entry (neither `pattern` nor `validate`) → FAIL, never a silent pass (`scripts/structural-invariants.mjs:259-264`).
  - Thrown `validate` → contained as FAIL (`scripts/structural-invariants.mjs:235-240`) — not relevant to a count-based entry but confirms the "never coerce to silent pass" posture.
- **Observability / output convention**: results are line-oriented stdout/stderr, not `.cycle/log.jsonl`. Pass → `console.log("structural-invariants: ok -- <file> <reason>: <actual>")` (`scripts/structural-invariants.mjs:257`); fail → `console.error("structural-invariants: FAIL …")` (`scripts/structural-invariants.mjs:253`). CLI exit-code contract: 0 clean / 1 failures / 2 internal (`scripts/structural-invariants.mjs:272-277`).
- **Idempotency / retry-safety**: the module is import-safe — the gate (read loop + `process.exit`) runs only under the `import.meta.url === pathToFileURL(process.argv[1]).href` main guard (`scripts/structural-invariants.mjs:270`), so importing `INVARIANTS`/`runInvariants` in tests never spawns or exits. `runInvariants` is pure aside from console output; re-running it is side-effect-free.
- **Type-checking the `.mjs`**: the file is `// @ts-check` (`scripts/structural-invariants.mjs:2`) with co-located JSDoc `@typedef Invariant` (`:30-42`). A new entry must conform to `{ file: string, reason: string, pattern?: RegExp, expected?: number }` or `npm run typecheck` fails. The repo-wide `allowJs` makes this check live (per CLAUDE.md structural-invariants policy).

### Dependencies & Integration Points
- `npm run check:invariants` runs `node scripts/structural-invariants.mjs` and is wired to run automatically after `test:coverage` (per CLAUDE.md and SPEC dependencies) — `scripts/structural-invariants.mjs`.
- The new invariant's target `src/engine/exec-codex.ts` is consumed by the codex exec lane registered in `src/engine/exec.ts` `REGISTRY` (via `resolveAgent("codex")`, exercised in `tests/engine/exec-codex.test.ts:6`). The invariant only reads the file's text statically; it does not import or execute the lane.
- Test imports: `tests/scripts/structural-invariants.test.ts:7` imports `{ runInvariants }` from the real `scripts/structural-invariants.mjs`; a new case for the present-and-passing assertion would additionally import `INVARIANTS` (per the SPEC acceptance criterion).
- No external services, env vars, or network are involved.

### Test Infrastructure
- **Test framework**: Node built-in `node:test` + `node:assert` (strict), run via `npm test` (`tests/scripts/structural-invariants.test.ts:1-2`). No transpile step (`--experimental-strip-types`).
- **Test conventions**: temp trees via `mkdtemp(join(tmpdir(), …))` with `try/finally` `rm(root, { recursive: true, force: true })`; fixtures under `tests/fixtures/structural-invariants/` (`cli-clean.ts`, `cli-violation.ts`, `triage-clean.ts`, `triage-violation.ts`, `cli-residue-*.ts`); subprocess runs via `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })`; in-process runs via the imported `runInvariants` with `captureConsoleError()` to assert diagnostics (`tests/scripts/structural-invariants.test.ts:9-10`, `:42-44`, `:140-147`).
- **`setup()` coupling to note**: `setup()` writes a minimal stub for every invariant-targeted file so the existing suite passes; its `exec-codex.ts` stub currently contains only the `CYCLE_CODEX_BIN` override line (`tests/scripts/structural-invariants.test.ts:31-36`). Any new count-based pattern targeting `exec-codex.ts` will be evaluated against this stub during the existing CLI-fixture tests — the stub content (or the test's expectations) must account for the added pattern so those tests stay green.
- **Current coverage of the change area**: `tests/scripts/structural-invariants.test.ts` covers violation→exit 1, clean→exit 0, cli bookkeeping pass/fail, residue arm/persist pass/fail, a throwing-`validate` containment case, a malformed-entry case, and two real-repo regression pins (`:46`, `:62`, `:75`, `:92`, `:106`, `:121`, `:149`, `:170`, `:191`, `:197`). The codex lane's runtime behavior is covered by `tests/engine/exec-codex.test.ts` (7 tests), including the `/^exec\b/` argv assertion (`:89`).
- **Failure-path test coverage**: yes — every invariant kind has an explicit failing-fixture test asserting exit 1 + stderr file/reason/expected/actual (e.g. `tests/scripts/structural-invariants.test.ts:46-60`, `:75-90`, `:121-136`). The unreadable-file (exit 2) path is exercised implicitly via the tagged-error branch; the malformed-entry and throwing-predicate FAIL containment paths are covered (`:149`, `:170`). The codex runtime failure paths (non-zero exit, ENOENT, rate-limit) are covered in `tests/engine/exec-codex.test.ts:43`, `:162`, `:186`.

## Code References
- `src/engine/exec-codex.ts:11` — `const argv: string[] = ["exec"];` — the exact construction the new invariant must pin.
- `src/engine/exec-codex.ts:20` — `const binary = process.env.CYCLE_CODEX_BIN ?? "codex";` — pinned by the adjacent existing invariant.
- `scripts/structural-invariants.mjs:78-202` — the `INVARIANTS` array; new entry belongs in the `src/engine/exec-codex.ts` group near line 144.
- `scripts/structural-invariants.mjs:139-144` — adjacent `CYCLE_CODEX_BIN` count-based entry the SPEC names as the shape model.
- `scripts/structural-invariants.mjs:249-258` — count-based dispatch/compare/emit logic the new entry runs through.
- `scripts/structural-invariants.mjs:214-267` — `runInvariants` export the new test drives in-process.
- `scripts/structural-invariants.mjs:30-42` — `@typedef Invariant` JSDoc the new entry must satisfy for `typecheck`.
- `tests/scripts/structural-invariants.test.ts:31-36` — `setup()` stub for `exec-codex.ts` (only the `CYCLE_CODEX_BIN` line today).
- `tests/scripts/structural-invariants.test.ts:191-201` — real-repo regression pins the happy-path case can mirror.
- `tests/engine/exec-codex.test.ts:89` — existing runtime `/^exec\b/` argv assertion (must remain green).

## Open Questions
- **Pattern tightness**: the SPEC requires the regex match `const argv: string[] = ["exec"]` and NOT match a bare-`codex` argv that omits the `exec` element. The planner should decide whether to anchor on the full `const argv: string[] = ["exec"]` text or the narrower `["exec"]` literal — the former is more regression-specific but more brittle to formatting; either must escape `[ ] "`. (Resolve in plan.)
- **`setup()` stub update vs. test expectations**: because `setup()` writes a stub `exec-codex.ts` containing only the override line, adding a count-based `["exec"]` pattern will make the existing CLI-fixture tests evaluate that pattern against a stub lacking it. The planner must decide whether to extend the `setup()` stub to include the `["exec"]` construction (keeping all existing fixture tests at exit 0) or otherwise reconcile expectations. (Resolve in plan.)
- **Documentation clause**: SPEC marks the CLAUDE.md codex-lane note as optional ("a single clause"). The planner should decide whether to add it; SPEC says no new section and no `docs/models.md` change.
```
