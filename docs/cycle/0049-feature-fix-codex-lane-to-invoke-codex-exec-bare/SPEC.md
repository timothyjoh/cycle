# SPEC — Cycle 0049: Build-time regression guard for the codex `exec` subcommand

## WHY
The codex lane fix already shipped: `src/engine/exec-codex.ts` invokes `codex exec …` (commit `c341b6d`), maps `thinking` to `-c model_reasoning_effort`, and `docs/models.md` documents the mapping. The one piece the source issue's *"Close the blind spot"* section demands that is **not yet in place** is a durable, build-time guard. Today the only protection against a regression to bare `codex` is a runtime unit assertion in `tests/engine/exec-codex.test.ts` (`/^exec\b/` against a fake binary's stdout). That assertion lives behind the same fake-agent harness that *hid the original bug* — a refactor of `exec-codex.ts` that drops the `"exec"` argv element while keeping the fake-binary plumbing could still pass the existing tests if the fake echoes argv differently. There is no entry in `scripts/structural-invariants.mjs` that statically pins the `exec` subcommand, even though the repo's structural-invariants policy is the designated single source of truth for "this must never regress" rules (e.g. the `CYCLE_CODEX_BIN` hermeticity invariant already sits right next to where this one belongs).

## CONCRETE USER BENEFIT
A maintainer who edits `src/engine/exec-codex.ts` and accidentally removes or reorders the `exec` subcommand (reverting the lane to bare `codex`) gets an immediate, named build failure from `npm run check:invariants` — *before* the change can ship and break a codex-based downstream repo (recon) with `stdin is not a terminal`. The guard fires at build time with a remediation message, not three cycles later as a `max_consecutive_failures` halt on someone else's machine.

## USABLE END-STATE
`npm run check:invariants` (which runs automatically after `test:coverage`) enforces that `src/engine/exec-codex.ts` constructs an argv array whose first element is the literal `"exec"`. Deleting or altering the `["exec"]` argv initialization causes a non-zero exit with a `FAIL` line that names the file and the reason. The existing codex behavior, tests, and docs are unchanged.

## Objective
Add a single structural invariant to `scripts/structural-invariants.mjs` that statically pins the codex lane's `exec` subcommand, converting the existing runtime-only protection into a build-time guard. This is the durable regression guard the source issue requested under *"Close the blind spot"*, closing the gap left after the functional fix shipped in `c341b6d`/`f8e1d23`.

## Source Issue
`txt-20260603-210000-codex-lane-use-exec-subcommand` — "Fix codex lane to invoke `codex exec` (bare `codex` fails 'stdin is not a terminal')"

## Scope

### In Scope
- Add one entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` asserting that `src/engine/exec-codex.ts` initializes its argv beginning with the literal `"exec"` element (count-based: exactly one occurrence of the `["exec"]` argv-start pattern, `expected: 1`), with a `reason` string explaining the codex non-interactive-subcommand contract.
- Add a test in `tests/scripts/structural-invariants.test.ts` that drives the new invariant in-process via the importable `runInvariants` export — asserting it passes against the real `exec-codex.ts` and that a synthetic bare-`codex` argv would fail.

### Out of Scope
- Any change to `src/engine/exec-codex.ts` behavior, argv, or the `thinking`→`reasoning_effort` mapping (already shipped and correct).
- Any change to `docs/models.md` (the mapping is already documented).
- Auditing/altering the gemini / auggie / opencode / pi lanes for the same interactive-vs-subcommand hazard (the issue lists this as "Consider…"; defer to a sibling cycle if a real hazard is found — this cycle delivers the codex guard only).
- An opt-in real-`codex` smoke test (the issue lists this as "ideally"; the static invariant plus the existing fake-binary unit tests are the deliverable here).

## Requirements
- The new invariant uses the count-based `{ file, pattern, expected, reason }` shape, matching the convention of the adjacent codex `CYCLE_CODEX_BIN` invariant at `scripts/structural-invariants.mjs:140`.
- The `pattern` regex matches the literal argv-start construction in `exec-codex.ts` (`const argv: string[] = ["exec"]`) and is anchored tightly enough that it would **not** match a bare-`codex` argv that omits the `exec` element.
- The invariant is registered in the `INVARIANTS` array so it is exercised by both the CLI gate (`node scripts/structural-invariants.mjs`) and the importable `runInvariants` export.
- No change to the CLI exit-code contract (0 clean / 1 failures / 2 internal) or stdout/stderr format of the invariants script.
- **Failure behavior**: when `exec-codex.ts` no longer matches the pinned pattern (e.g. the `exec` element is removed, or the match count diverges from `expected: 1`), `runInvariants` counts a failure and the CLI gate exits non-zero with a `FAIL` line naming `src/engine/exec-codex.ts` and the `reason`. The invariant must never coerce a missing/changed pattern into a silent pass. If the target file is unreadable, the existing per-file read-error path in the gate surfaces it as a failure (not a skipped check) — no new swallow path is introduced.

## Acceptance Criteria
- [ ] `npm run check:invariants` exits 0 against the current tree (the new invariant passes because `exec-codex.ts` already begins its argv with `"exec"`).
- [ ] A maintainer who removes the `"exec"` argv element from `src/engine/exec-codex.ts` causes `npm run check:invariants` to exit non-zero with a `FAIL` line naming `src/engine/exec-codex.ts` — verified by a test that feeds a synthetic bare-`codex` argv (or temporarily mutated text) through `runInvariants` and asserts the returned failure count is ≥ 1. *(failure-path + user-observable-benefit criterion)*
- [ ] `tests/scripts/structural-invariants.test.ts` gains a case importing the real `INVARIANTS`/`runInvariants` exports that asserts the codex-`exec` invariant is present and passes against the real repo file.
- [ ] The existing codex unit tests in `tests/engine/exec-codex.test.ts` still pass unchanged.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean; the `.mjs` JSDoc `@ts-check` annotations remain valid).

## Testing Strategy
- Node's built-in `node:test` + `assert`, consistent with `tests/scripts/structural-invariants.test.ts`.
- Key scenarios:
  - **Happy path**: the new invariant is present in `INVARIANTS` and `runInvariants(INVARIANTS, repoRoot)` returns `0` for the codex-`exec` entry against the real `exec-codex.ts`.
  - **Failure path**: a synthetic invariants array (or a temp copy of `exec-codex.ts` with the `exec` element stripped) drives the pattern to `expected`-mismatch, and `runInvariants` returns a failure count ≥ 1.
  - **Regression**: existing codex exec-lane unit tests and the existing structural-invariants tests remain green.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No new convention. The structural-invariants policy section already states the `INVARIANTS` table is the single source of truth; this cycle adds one entry under that existing policy. Optionally note in the codex lane's existing architecture bullet that the `exec` subcommand is now build-time-pinned — keep to a single clause, no new section.
- **README.md**: No user-facing change to surface.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `scripts/structural-invariants.mjs` with its importable `runInvariants(invariants, cwd)` and `INVARIANTS` exports and the count-based `{ file, pattern, expected, reason }` entry shape (already present).
- `src/engine/exec-codex.ts` already invoking `codex exec` (shipped in commit `c341b6d`) — the file this invariant pins.
- `npm run check:invariants` wired to run after `test:coverage` (already configured).
- No external services or env vars required.
