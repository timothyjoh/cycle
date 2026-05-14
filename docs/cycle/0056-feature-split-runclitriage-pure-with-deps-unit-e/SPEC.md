```markdown
# SPEC — Cycle 0056: Split runCliTriage into prod wrapper + with-deps unit entry point

## Objective
Close the leaked test-mock surface on `runCliTriage` by splitting `src/cli/triage.ts` into a thin production wrapper (`runCliTriage(repoRoot, argv)`) that constructs and threads real dependencies, plus a pure injectable entry point (`runCliTriageWithDeps(repoRoot, argv, deps)`) that the unit suite drives. The production caller in `src/cli.ts` can no longer pass `deps` — compile-time, not by convention — eliminating the risk that a future edit accidentally wires mocks into prod.

## Source Issue
`refl-0023-runclitriage-deps-param-leaks-mock-surfa-split-deps-injection-from-prod-entry` — "Split runCliTriage: pure with-deps unit entry point + thin prod wrapper with hardcoded deps"

## Scope

### In Scope
- Split `src/cli/triage.ts` into two named exports: a two-arg `runCliTriage` (prod wrapper, hardcoded real deps) and a three-arg `runCliTriageWithDeps` (full body, fully injectable). Existing import in `src/cli.ts` keeps working unchanged.
- Migrate `tests/cli/triage-handler.test.ts` so deps-injecting cases call `runCliTriageWithDeps`; preserve at least one assertion that exercises the two-arg `runCliTriage` wrapper end-to-end (covering the deps-construction line) so per-file coverage on the wrapper does not regress.

### Out of Scope
- Reworking `TriageDeps` shape or what is injectable (the existing type is reused as-is).
- Splitting `dryRunTriage` in `src/engine/triage.ts` — sibling raw `refl-0023-dry-run-untested-paths-runagent-throws-a` may follow the same pattern but is not bundled here.
- Any change to `src/cli.ts` beyond keeping its existing single-line call site green.

## Requirements
- `runCliTriage(repoRoot: string, argv: string[])` is the only export the prod path uses; its TypeScript signature does not accept a `deps` parameter (no optional, no default).
- `runCliTriageWithDeps(repoRoot: string, argv: string[], deps: TriageDeps)` carries the full body that today lives in `runCliTriage` (help short-circuit, `--dry-run` gate, `loadConfig` → `dryRunTriage` → JSON-stringify report).
- `runCliTriage` constructs the real deps (currently `{}` — `dryRunTriage` itself defaults the injection points internally) and delegates: `return runCliTriageWithDeps(repoRoot, argv, {})`. No conditional logic on the wrapper.
- `TriageDeps` remains exported from `src/engine/triage.ts` and re-importable by the test file.
- Public return shape (`{ exitCode, stdout, stderr? }`) is byte-identical to today for both functions.
- `npm run typecheck` is clean; `npm test` and `npm run test:coverage` are green; coverage floor (line ≥ 95% / branch ≥ 75% / function ≥ 90% global, `src/engine/triage.ts` ≥ 95% per-file) holds with no new per-file regressions for `src/cli/triage.ts` or `src/cli.ts`.

## Acceptance Criteria
- [ ] `src/cli/triage.ts` exports both `runCliTriage` (two-arg) and `runCliTriageWithDeps` (three-arg, `deps: TriageDeps` required — non-optional).
- [ ] `grep -nE "runCliTriage\(" src/` shows zero call sites passing a third argument (i.e., the prod path cannot inject deps).
- [ ] `src/cli.ts` continues to import `runCliTriage` and call it with `(process.cwd(), argv.slice(1))` — diff against master shows no change to this file.
- [ ] `tests/cli/triage-handler.test.ts` imports `runCliTriageWithDeps` for every case that stubs `runAgent` / `loadConfig` / `readdir`; at least one case still invokes the two-arg `runCliTriage` wrapper to exercise the delegation line.
- [ ] All existing assertions in `tests/cli/triage-handler.test.ts` pass with behavior identical to master (no `last_error` text drift, no `stdout` shape drift).
- [ ] `npm test` and `npm run test:coverage` exit 0; `npm run check:coverage` exit 0; per-file coverage on `src/cli/triage.ts` and `src/cli.ts` is not worse than master baseline.
- [ ] `npm run typecheck` exits 0.

## Testing Strategy
- Framework: Node's native test runner (`node --test`), spec reporter — same harness already used by `tests/cli/triage-handler.test.ts`.
- Migrate existing dep-injection cases (lines 125, 146 in `tests/cli/triage-handler.test.ts`) to `runCliTriageWithDeps`. The deps-free cases (`--help`, `-h`, no-flag, `--dry-run` against empty `raw/`) stay on the two-arg `runCliTriage` and act as the wrapper-coverage smoke tests.
- Cover the wrapper delegation: at least one assertion that calls `runCliTriage(root, ["--dry-run"])` on an empty `raw/` and confirms the JSON-array stdout + `exit 0` — this exercises the wrapper's `runCliTriageWithDeps(repoRoot, argv, {})` line.
- No new test files; no changes to `tests/engine/triage*.test.ts`.
- E2E: not applicable (no UI surface).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change — the split is internal to `src/cli/triage.ts`; the `cycle triage --dry-run` command surface and exit-code contract documented in the Commands table are unaffected.
- **README.md**: No change.

Documentation is part of "done" — code without updated docs is incomplete. Verified: this cycle's split does not touch any user-facing behavior or documented invariant, so no doc edits are warranted.

## Dependencies
- `TriageDeps` type already exported from `src/engine/triage.ts` (line 29). No new exports needed from the engine side.
- `dryRunTriage` already accepts and threads `deps` (signature at `src/engine/triage.ts:159`). No engine change needed.
- No external services or env vars.
```
