# Research: Cycle 0048

## Cycle Context
SPEC asks for a single test-only addition to `tests/engine/empty-diff-guard.test.ts`: one integration case exercising the `expects_code: false` opt-out where the sole doc deliverable lives in a brand-new, fully untracked subdirectory (e.g. `docs/adr/0001.md`). The case must assert the cycle resolves to `ok` (docs committed via the normal `commitCycle` path, not `cycle.noop`/`noopDrain`), and must be *discriminating* — it passes against current code and fails if `--untracked-files=all` is removed from the doc-deliverable scan in `src/engine/run-cycle.ts`. No production code change is expected.

## Current Codebase State

### Relevant Components
- Doc-deliverable empty-diff opt-out (the behavior under test): `src/engine/run-cycle.ts:772`–`848`. After a `build`/`fix` step exits 0, the engine runs `git status --porcelain -- src scripts tests` (`src/engine/run-cycle.ts:777`). When that diff is empty, it lazily resolves `expects_code` from the source issue and, if `false`, scans for a doc deliverable.
- The `--untracked-files=all` scan being locked: `src/engine/run-cycle.ts:810` — `spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "docs"], …)`. The `docDeliverable` flag is set when `docs.status === 0 && parseDocDeliverablePaths(docs.stdout ?? "").length > 0` (`src/engine/run-cycle.ts:815`–`816`).
- `resolveExpectsCode(fm)`: `src/engine/run-cycle.ts:114`–`116`. Returns `false` only for an explicit boolean `expects_code === false`; absent/non-boolean/`true` ⇒ `true` (fail-closed).
- `parseDocDeliverablePaths(stdout)`: `src/engine/run-cycle.ts:123`–`139`. Parses porcelain lines, strips the `XY ` status prefix (`raw.slice(3)`), unwraps rename/copy `->` targets and surrounding quotes, then keeps paths that `startsWith("docs/")`, are not `isDenied`, and are not under `docs/cycle/` (`src/engine/run-cycle.ts:134`–`135`). A bare directory entry like `docs/` (slice(3) ⇒ empty/`""`) does not start with `docs/`-plus-content in the discriminating sense the SPEC describes: with `--untracked-files=all` git emits per-file paths (`docs/adr/0001.md`), which pass the filter; without the flag git collapses a new untracked subtree to a single `?? docs/` entry — `raw.slice(3)` yields `docs/` which is retained by `startsWith("docs/")` and not excluded by `docs/cycle/`, so the bug is that the bare directory entry *would* satisfy the deliverable check. The flag forces real file paths so the test fixture's untracked-subtree path is observed correctly.
- Relaxation outcome: `src/engine/run-cycle.ts:819`–`823` — when `!expectsCode && docDeliverable`, `r.status` stays `"ok"`; `step.end` fires `ok`, the cycle proceeds to a normal `ok` completion (docs committed by `commitCycle`). Explicitly **not** a `cycle.noop`/`noopDrain` path. The else branch (`src/engine/run-cycle.ts:824`–`847`) runs the `NOOP.md` marker gate, falling back to `formatEmptyDiffGuardError(step.name)` failure.

### Existing Patterns to Follow
- Test harness setup: `setupRepo(fakeBody, stepName)` (`tests/engine/empty-diff-guard.test.ts:37`–`54`) creates a temp git repo on branch `main`, an empty init commit, `.cycle/workflows.yml` (via `workflowYml`, `:15`–`35`, single-step `feature` workflow), a step prompt, and a fake `claude` executable in a separate temp bin dir.
- `writeIssue(root, issueId, frontmatter)`: `tests/engine/empty-diff-guard.test.ts:61`–`69` — writes `docs/cycle/issues/todo/<issueId>.md` with the given frontmatter (used to set `expects_code: false`).
- `cleanup(root, bin)`: `tests/engine/empty-diff-guard.test.ts:56`–`59` — `rm` both temp dirs; every case wraps its body in `try/finally` calling `cleanup` (e.g. `:236`/`:268`).
- `countEvents(log, pred)`: `tests/engine/empty-diff-guard.test.ts:71`–`76` — parses `.cycle/log.jsonl` lines and counts matches.
- The closest mirror case is **"expects_code:false: empty code diff + non-empty docs/** -> ok (committed, no noop)"** (`tests/engine/empty-diff-guard.test.ts:224`–`271`). Its fake build body does `mkdir -p docs` + `printf "research findings\n" > docs/RFC-x.md` (`:230`–`231`) — a **top-level** `docs/RFC-x.md`, which lists identically with or without `--untracked-files=all`. Its assertions: `r.status === "ok"` (`:244`); exactly one `step.end build ok` (`:246`–`250`); zero `step.end build failed` (`:251`–`255`); exactly one `cycle.end ok` (`:256`–`260`); zero `cycle.noop` (`:261`–`265`); and the deliverable file content survives in the tree (`:267`). The new case mirrors this, changing only the deliverable path to a new untracked subtree (e.g. `mkdir -p docs/adr` + write `docs/adr/0001.md`).
- `runCycle` invocation shape: `tests/engine/empty-diff-guard.test.ts:238`–`243` — `runCycle(root, { issueId, title, workflow: "feature", env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" } })`. The fake `claude` on `PATH` is the agent for the single `build` step.
- Failure handling (existing, in the area): a failed empty-diff guard sets `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = formatEmptyDiffGuardError(step.name)` (`src/engine/run-cycle.ts:843`–`845`). A scan-error (`git status` non-zero) leaves `docDeliverable = false`, so the relaxation is withheld (comment `src/engine/run-cycle.ts:806`–`809`). The `try/catch` around the issue read degrades to `expectsCode = true` (`:800`–`802`).
- Observability: the engine emits structured JSON events to `.cycle/log.jsonl`. Relevant events for assertions: `step.end { step, status }`, `cycle.end { status }`, `cycle.noop`. Tests read the log file and count events (no metrics layer).
- Idempotency / retry-safety: not applicable to this test-only addition; the case must be self-contained (own temp repo/fixtures, no cross-test ordering), matching sibling cases.
- Cardinality-pinning convention (CLAUDE.md): assert `filter(...).length === 1` for exactly-once events; `countEvents(...) === 1` already follows this in the mirror case.

### Dependencies & Integration Points
- `runCycle` and `formatEmptyDiffGuardError`: imported from `../../src/engine/run-cycle.ts` (`tests/engine/empty-diff-guard.test.ts:7`).
- `parseFrontmatter`: `src/engine/frontmatter.ts` (imported at `src/engine/run-cycle.ts:31`); used to resolve `expects_code` from the issue file.
- `isDenied`: `src/engine/path-utils.ts` (`src/engine/run-cycle.ts:29`); used by `parseDocDeliverablePaths`.
- `git` CLI via `spawnSync` (array args, `shell:false`) in both the test helper (`tests/engine/empty-diff-guard.test.ts:9`–`13`) and the production scan.
- `tests/helpers.ts` exports `expectExactlyOne` (`tests/helpers.ts:3`); the file currently uses the local `countEvents` helper instead.

### Test Infrastructure
- Test framework: `node:test` with `node:assert` (strict), run via `npm test` (auto-builds) and `npm run test:coverage`. Node ≥ 22.6, `--experimental-strip-types`, no transpile.
- Test conventions: one `test("…", async () => { … })` per case; temp repos via `mkdtemp` under `tmpdir()`; fake agent as an executable shell script (`SHEBANG = "#!/bin/bash"`, `tests/engine/empty-diff-guard.test.ts:78`) on `PATH`; `try/finally` cleanup.
- Current coverage of the change area: `src/engine/run-cycle.ts` has a per-file floor of 90% (CLAUDE.md). The `expects_code: false` path is already exercised by three cases (`:224`, `:273`, `:300`). Adding a discriminating case does not change production code, so floors are unaffected (SPEC marks coverage-floor changes out of scope).
- Failure-path test coverage for the change area: yes — `"expects_code:false: empty code diff + no docs deliverable -> failed (anti-slop)"` (`tests/engine/empty-diff-guard.test.ts:273`–`298`) asserts `r.status === "failed"`, `failingStep === "build"`, and `log` matches `/build post-condition failed/`; `"unreadable/missing issue file -> defaults true, guard fires"` (`:300`–`326`) covers the degrade-to-`true` default; `formatEmptyDiffGuardError` shape test (`:328`–`336`).

## Code References
- `src/engine/run-cycle.ts:114` — `resolveExpectsCode`; `false` only for explicit boolean `expects_code: false`.
- `src/engine/run-cycle.ts:123` — `parseDocDeliverablePaths`; filters porcelain lines to in-scope `docs/**` paths outside `docs/cycle/**`.
- `src/engine/run-cycle.ts:777` — empty-diff scan over `src scripts tests`.
- `src/engine/run-cycle.ts:810` — the `--untracked-files=all` doc-deliverable scan being locked by this test.
- `src/engine/run-cycle.ts:819` — relaxed branch: leaves `r.status === "ok"`, no `cycle.noop`.
- `tests/engine/empty-diff-guard.test.ts:224` — the mirror case (top-level `docs/RFC-x.md`) to copy and adapt.
- `tests/engine/empty-diff-guard.test.ts:37` — `setupRepo`; `:61` — `writeIssue`; `:71` — `countEvents`.

## Open Questions
- None blocking. The mirror case at `tests/engine/empty-diff-guard.test.ts:224` is the template; the only delta is creating the deliverable inside a previously-nonexistent subdirectory (`mkdir -p docs/<subdir>` then writing `docs/<subdir>/<file>.md`) so that, absent `--untracked-files=all`, git would collapse the new subtree to a single `?? docs/<subdir>/` entry. The planner should confirm whether the discriminating mechanism is best asserted purely via the `ok`/no-`noop` outcome (per the mirror case's assertions) — manual flag-removal verification during build is the SPEC's stated check (Testing Strategy), not an in-suite assertion.
