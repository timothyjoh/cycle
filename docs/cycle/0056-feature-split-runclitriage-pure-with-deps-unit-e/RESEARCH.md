```markdown
# Research: Cycle 0056

## Cycle Context
Split `src/cli/triage.ts:runCliTriage` into two-arg prod wrapper (no `deps` param) plus three-arg `runCliTriageWithDeps` (required `deps`). Eliminates compile-time risk of prod call site passing mocks. Migrate `tests/cli/triage-handler.test.ts` deps-injecting cases to the with-deps export; keep at least one case driving the wrapper for delegation coverage. No engine or CLI-entry changes; behavior + return shape unchanged.

## Current Codebase State

### Relevant Components
- `runCliTriage` (single export today, deps optional with `{}` default): `src/cli/triage.ts:22-40`
  - HELP constant + help short-circuit: `src/cli/triage.ts:4-20,27-29`
  - `--dry-run` gate (exit 2 + HELP to stderr): `src/cli/triage.ts:30-32`
  - `loadConfig` → `dryRunTriage(repoRoot, cfg, deps)` → JSON-stringify report → exit 1 if any `status:"failed"`: `src/cli/triage.ts:33-39`
- Sole prod call site (two-arg today): `src/cli.ts:57-63`
- Test suite (6 cases, two pass `deps`): `tests/cli/triage-handler.test.ts:1-156`
  - deps-injecting cases at `tests/cli/triage-handler.test.ts:125` and `tests/cli/triage-handler.test.ts:146`
  - deps-free cases (`--help`, `-h`, no-flag, `--dry-run` empty `raw/`): lines `36`, `48`, `59`, `72`

### Existing Patterns to Follow
- `TriageDeps` shape (the type to re-import): `src/engine/triage.ts:29-31` — `{ runAgent?: TriageAgentRunner }`
- Engine-side mirror pattern (already done for the engine path): `dryRunTriage(repoRoot, cfg, deps: TriageDeps = {})` at `src/engine/triage.ts:251-307`, paired with `runTriage(..., deps: TriageDeps = {})` at `src/engine/triage.ts:155-249`. Engine functions currently keep `deps` optional with `{}` default — SPEC requires the new with-deps CLI export to make `deps` **required** (non-optional).
- Dynamic-import lazy loader for CLI subcommands: `const { runCliTriage } = await import("./cli/triage.ts");` at `src/cli.ts:58`. Re-export naming convention is the function name itself.
- Test harness convention: Node's native `node:test` + `node:assert/strict`, `mkdtemp`/`rm` per-case temp repos, `.cycle/workflows.yml` + `.cycle/prompts/triage.md` fixtures in `repo()` helper: `tests/cli/triage-handler.test.ts:1-34`.
- TypeScript ES2023 floor, sources executed directly via `--experimental-strip-types` (no transpile step for tests). Per CLAUDE.md "Runtime".

### Dependencies & Integration Points
- `loadConfig` from `../engine/workflow.ts`: `src/cli/triage.ts:1` — read once before `dryRunTriage`; not part of `TriageDeps` today.
- `dryRunTriage` + `TriageDeps` from `../engine/triage.ts`: `src/cli/triage.ts:2`; `dryRunTriage` itself defaults `runAgent` to `runAgentViaDispatch` internally (`src/engine/triage.ts:256`), so passing `{}` is byte-identical to passing nothing.
- Prod entry binding: `src/cli.ts:57-63` — only consumer outside tests. SPEC forbids any change here beyond keeping it green.
- `DryRunReport[]` JSON serialization shape: emitted via `JSON.stringify(reports, null, 2) + "\n"` at `src/cli/triage.ts:38` — must remain byte-identical.

### Test Infrastructure
- Framework: Node native test runner (`node --test`), spec reporter. `tsconfig.json`/`package.json` `pretest` auto-builds `dist/cycle.js` first (CLAUDE.md Commands table).
- File under test today: `tests/cli/triage-handler.test.ts` (only consumer of `runCliTriage`). 6 tests; 2 inject `runAgent` via the optional `deps` parameter.
- Coverage policy: global line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floor enforced on `src/engine/triage.ts` ≥ 95% via `scripts/coverage-gate.mjs`. `src/cli/triage.ts` and `src/cli.ts` are NOT in the `FLOORS` table — only the global aggregate gates them, but SPEC requires no per-file regression vs master baseline for these two files (Acceptance §6).
- Coverage rerun command without re-suiting: `npm run check:coverage` (CLAUDE.md Commands table).

## Code References
- `src/cli/triage.ts:22-40` — current single `runCliTriage` definition; the body to be lifted verbatim into `runCliTriageWithDeps`.
- `src/cli/triage.ts:25` — the `deps: TriageDeps = {}` parameter that must disappear from the wrapper's signature post-split.
- `src/cli.ts:58-59` — the lone prod import + call site; remains `runCliTriage(process.cwd(), argv.slice(1))` (two args) after the split.
- `src/engine/triage.ts:29-31` — `TriageDeps` definition (already exported, re-import unchanged).
- `src/engine/triage.ts:251-307` — `dryRunTriage(repoRoot, cfg, deps?: TriageDeps)`, the function the wrapper delegates into.
- `tests/cli/triage-handler.test.ts:6` — import line that will need to add `runCliTriageWithDeps` alongside `runCliTriage`.
- `tests/cli/triage-handler.test.ts:125-127` — first deps-injecting case (`status:ok` path) to migrate.
- `tests/cli/triage-handler.test.ts:146-148` — second deps-injecting case (`status:failed` path) to migrate.
- `tests/cli/triage-handler.test.ts:72-81` — pre-existing wrapper coverage candidate (`--dry-run` against empty `raw/`); already exercises two-arg call and asserts JSON `[]` + exit 0.

## Open Questions
- Should `runCliTriageWithDeps`'s `deps` parameter be typed `TriageDeps` (matching engine optional fields, `{ runAgent?: ... }`) or a stricter "all required" variant? SPEC §Requirements line 25 says "the existing type is reused as-is" → keep `TriageDeps` shape with `runAgent?` optional; the *parameter itself* is non-optional but its fields stay optional.
- Wrapper signature: SPEC says the prod wrapper "constructs the real deps (currently `{}` — `dryRunTriage` itself defaults the injection points internally) and delegates: `return runCliTriageWithDeps(repoRoot, argv, {})`". Plan needs to confirm no other deps construction is wanted (e.g. no future-proofing factory) — SPEC explicit "No conditional logic on the wrapper."
- Coverage smoke: SPEC §Testing Strategy says the existing deps-free `--help`/`-h`/no-flag/empty-`raw/` cases double as wrapper-coverage. Confirm during plan whether the empty-`raw/` case alone (which actually reaches the `runCliTriageWithDeps(..., {})` delegation line) is sufficient, or whether the help-short-circuit cases (which return before delegation) count toward wrapper function-coverage on their own.
```
