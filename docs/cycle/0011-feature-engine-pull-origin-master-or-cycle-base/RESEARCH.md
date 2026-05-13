```markdown
# Research: Cycle 0011

## Cycle Context
SPEC asks: after `runCycle` finishes its work and the `finally` block
calls `checkoutBase(repoRoot, CYCLE_BASE)`, refresh the local base from
`origin` (`git fetch origin <CYCLE_BASE>` + `git merge --ff-only
FETCH_HEAD`) so the *next* cycle branches off the up-to-date remote tip
rather than a stale local one (root cause of PR #11 conflict in cycle
0009). The fast-forward is best-effort: failures (no remote, divergence,
offline) must not throw out of `runCycle`; they must surface as a single
new JSONL log event (`cycle.base_pull` or similar) with `status: "ok" |
"failed"`, the base name, and SHA before/after (or reason). Subprocess
discipline (`spawn` w/ array args, no `shell: true`) preserved. Reuses
`cycleEnv.CYCLE_BASE`; no new env vars or flags.

## Current Codebase State

### Relevant Components

- **`runCycle` orchestrator**: top-level engine entry; runs workflow
  steps, then `finally`-block restores HEAD to base — the exact insertion
  point for the new fast-forward step. `src/engine/run-cycle.ts:29-78`.
- **`finally` checkout block**: snapshots `currentBranch` as
  `headBefore`, calls `checkoutBase`, emits `cycle.checkout` event with
  `status: "ok" | "failed"`. `src/engine/run-cycle.ts:69-77`.
- **`currentBranch` helper**: local `spawn`-based git wrapper inside
  `run-cycle.ts`. Returns trimmed `rev-parse --abbrev-ref HEAD` stdout
  or `null` on failure (never throws). Useful template for the new
  fetch/merge runner if a private helper is preferred over a `branch.ts`
  export. `src/engine/run-cycle.ts:12-20`.
- **`checkoutBase` / `git` helper**: thin wrapper module. The internal
  `git(repoRoot, args)` function in `branch.ts` already implements the
  rejecting-on-nonzero pattern with stderr capture — the same shape any
  new `fetchRemote` / `fastForward` exports would follow.
  `src/engine/branch.ts:5-15`, `src/engine/branch.ts:25-27`.
- **Logger**: append-only JSONL writer. `emit(event, fields)` adds
  `ts` + `event` and serializes the rest. Used for all engine events;
  new `cycle.base_pull` event lands through the same `log.emit(...)`
  call. `src/engine/log.ts:8-18`.
- **`cycleEnv` construction**: where `CYCLE_BASE` is resolved
  (`process.env.CYCLE_BASE ?? "main"` + caller override via `opts.env`).
  `src/engine/run-cycle.ts:38-44`. The new fetch/merge must read
  `cycleEnv.CYCLE_BASE` to stay aligned with `checkoutBase`.

### Existing Patterns to Follow

- **Subprocess: `spawn` + array args, capture stderr, no shell.** Every
  git call goes through this shape. `src/engine/branch.ts:5-15` (rejects
  with stderr text), `src/engine/run-cycle.ts:12-20` (resolves `null`
  on error — best-effort variant). The new fetch/merge step needs the
  best-effort shape (mirrors `currentBranch` rather than `git`).
- **Best-effort cleanup in `finally`**: the existing `checkoutBase`
  call is wrapped `try/catch`, with a status field on the emitted event.
  The new fast-forward step uses the same pattern, layered after the
  existing one. `src/engine/run-cycle.ts:69-77`.
- **Event vocabulary**: `<scope>.<verb>` (`cycle.start`, `cycle.end`,
  `cycle.checkout`, `step.start`). New name should match the family —
  e.g., `cycle.base_pull`. Field convention: `cycle_id`, `status`,
  topic-specific extras. `src/engine/run-cycle.ts:35`,
  `src/engine/run-cycle.ts:48`, `src/engine/run-cycle.ts:73-75`.
- **Test harness for engine git behavior**: each test `mkdtemp`s a
  fresh repo, `git init -b main`, sets user identity, drops a YAML
  workflow + a `claude` shim in a temp bin dir, runs `runCycle`,
  asserts on `log.jsonl` text via regex. `tests/engine/run-cycle.test.ts`
  (whole file). The two-repo `origin` setup needed by SPEC §Testing is
  *not* yet used anywhere in the suite — establishing it is new.

### Dependencies & Integration Points

- **`git` binary** (PATH). Hard dep already; `fetch` and `merge` need
  no additional install.
- **`origin` remote**: not configured by any existing engine code;
  caller / test setup wires it up. Absence path must be exercised.
- **`cycleEnv.CYCLE_BASE`**: defaulted to `"main"` here
  (`src/engine/run-cycle.ts:41`); same source `checkoutBase` reads
  (`src/engine/run-cycle.ts:72`).
- **`createLogger`**: instantiated at the top of `runCycle`
  (`src/engine/run-cycle.ts:31`); already in scope inside the `finally`.
- **No callers other than tests + the CLI** invoke `runCycle` —
  `src/cli.ts` / `src/cli/parse-args.ts` (per CLAUDE.md). The new event
  flows out the same JSONL pipe; no CLI contract changes.

### Test Infrastructure

- **Framework**: `node:test` + `node:assert` (strict). Run via
  `npm test` (Node's native runner, no transpile; uses
  `--experimental-strip-types`). `CLAUDE.md` "Commands" table.
- **Coverage**: `npm run test:coverage` (native
  `--experimental-test-coverage`), excludes `dist/`, `tests/`,
  `scripts/`. SPEC's acceptance criterion demands no regression below
  baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%). `CLAUDE.md`
  "Coverage policy".
- **Test conventions**:
  - Mirrors `src/` layout: `tests/engine/<module>.test.ts`.
  - Tempdir per test, full cleanup in `finally`.
  - Real `git init` repos (no mocking).
  - `claude` CLI faked via a tempdir prepended to `PATH` containing a
    `claude` shell shim.
  - Workflow YAML, prompts, scripts materialized at test setup.
  - Assertions via `assert.match(log, /…/)` on raw `.cycle/log.jsonl`.
  - Per-test `mkdtemp` + `rm({ recursive: true })` in `finally`.
  Source: `tests/engine/run-cycle.test.ts` (all 5 tests follow this
  shape), `tests/engine/branch.test.ts:9-13` (`git` helper).
- **Current coverage of the change area**:
  `tests/engine/run-cycle.test.ts` already covers the `cycle.checkout`
  success path (line 87-97), the failed-cycle checkout path (104-152),
  the bad-base failure path (218-255), and base-branch passthrough
  via `env.CYCLE_BASE` (`tests/engine/run-cycle.test.ts:43`,
  `:83`, etc.). No test today configures a remote or simulates a
  remote-ahead local repo. `tests/engine/branch.test.ts` covers
  `createCycleBranch` + `checkoutBase` directly with the same tempdir
  pattern (lines 15-65), but again no remote.

## Code References

- `src/engine/run-cycle.ts:12-20` — `currentBranch` helper, best-effort
  `spawn` template (resolves `null`, never throws).
- `src/engine/run-cycle.ts:29-44` — `runCycle` entry; `cycleEnv` built
  with `CYCLE_BASE`.
- `src/engine/run-cycle.ts:46-67` — main step loop; not in scope to
  change.
- `src/engine/run-cycle.ts:69-77` — `finally` block; insertion point —
  the new fast-forward + event emission lives after the existing
  `cycle.checkout` emit and inside the same `try { checkoutBase … }`
  outer scope (but as a separate `try` so a checkout failure does not
  prevent the pull attempt unless that's the intended semantics —
  see Open Questions).
- `src/engine/branch.ts:5-15` — `git` helper used by `checkoutBase`;
  pattern reference for any new exported helper.
- `src/engine/branch.ts:17-27` — `createCycleBranch` and `checkoutBase`
  exports (the module surface a new `fetchAndFastForward` would extend
  if added here vs. inlined in `run-cycle.ts`).
- `src/engine/log.ts:8-18` — `createLogger` / `emit` shape; the
  destination for the new event.
- `tests/engine/run-cycle.test.ts:9-13` — `git` test helper used to
  drive real repos in tests.
- `tests/engine/run-cycle.test.ts:59-102` — happy-path checkout test
  template most directly comparable to the new success-path test.
- `tests/engine/run-cycle.test.ts:218-255` — failure-path checkout test
  template most directly comparable to the new failure-path test
  (asserts `status: "failed"` + `reason` in the JSONL).
- `tests/engine/branch.test.ts:15-65` — `branch.ts` direct test
  template; relevant if a new helper is exported and unit-tested
  alongside `checkoutBase`.
- `CLAUDE.md` "Subprocess discipline" — invariant the new code must
  honor (no `exec`, no `shell: true`).
- `docs/ARCHITECTURE.md:236-269` — JSONL event vocabulary listing; if
  a future revision enumerates events the new `cycle.base_pull` belongs
  here (today it does not enumerate `cycle.checkout` either).

## Open Questions

1. **Helper location** — should the fetch + ff-merge live as a new
   exported function in `src/engine/branch.ts` (paralleling
   `checkoutBase`) or as a private helper inside `run-cycle.ts`
   (paralleling `currentBranch`)? Both patterns already exist in
   the codebase; SPEC names neither.
2. **Event name and exact field set** — SPEC says "e.g.,
   `cycle.base_pull`" with `status`, `base`, and "SHA moved-from /
   moved-to (or an equivalent indicator that ff happened)". Field
   names (`sha_before` / `sha_after`? `from` / `to`? a boolean
   `fast_forwarded`?) need to be pinned by the planner.
3. **Ordering vs. `checkoutBase` failure** — if `checkoutBase` itself
   fails (`cycle.checkout` `status: "failed"`), should the pull step
   still run, or short-circuit with `status: "skipped"`? SPEC says
   "Fetch + ff-merge happens **after** `checkoutBase` succeeds";
   plan needs to decide whether failure of the prior step records a
   `skipped` event or no event at all.
4. **Concurrent two-fetch semantics** — SPEC requires the test to set
   up `origin` ahead of local. Decision needed on whether the test
   creates `origin` as a bare adjacent repo + commits there, or
   pushes from a second clone. Existing tests do not establish either
   pattern.
5. **`stderr` capture for `reason`** — the existing best-effort
   `currentBranch` discards stderr; the existing rejecting `git`
   helper in `branch.ts` captures it. The new code needs stderr in
   the failure event (`reason`) — confirms a `branch.ts`-style
   helper is the better fit, or a new helper.
6. **SHA capture mechanism** — `rev-parse <base>` before and after,
   or parse `git merge --ff-only` output / `git merge-base`? Pinning
   the approach is a small planner decision.
