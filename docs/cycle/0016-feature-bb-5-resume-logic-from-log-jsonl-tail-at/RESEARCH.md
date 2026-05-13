```markdown
# Research: Cycle 0016

## Cycle Context

BB-5 (RFC-001 §§ 10, 11, 12). Add resume-from-`log.jsonl`-tail to the
engine. On `engine.start`, scan `.cycle/log.jsonl` from the tail to detect
an in-flight cycle (a `cycle.start` with no matching `cycle.end`, or a
`step.start` with no matching `step.end`); if found, refetch base
(`git fetch` + ff merge), preserve the cycle branch and earlier artifacts,
and re-run from the last incomplete step. Then fall through to the normal
triage → pop loop. Each step must be restart-tolerant: prompt steps
overwrite their artifact, `commit.sh` is already idempotent, `pr.sh` must
detect an existing PR by branch and resume polling/fallback merge instead
of re-creating. Subsumes the existing "engine: pull origin/master between
cycles" issue (`txt-20260513-020016`).

## Current Codebase State

### Relevant Components

- Engine entry (CLI orchestrator): `src/cli.ts:44-195`. Emits
  `engine.start` (`src/cli.ts:45`), runs triage (`src/cli.ts:61`,
  `src/cli.ts:102`), pops next pending row (`src/cli.ts:109`), allocates
  cycle id (`src/cli.ts:130`), calls `markInProgress` (`src/cli.ts:131`),
  invokes `runCycle` (`src/cli.ts:133-138`), drains queue
  (`src/cli.ts:140-186`), emits `engine.stop` (`src/cli.ts:189`).
- Single-cycle driver: `src/engine/run-cycle.ts:30-92`. Allocates
  `cycleId` if absent (`run-cycle.ts:31`), loads workflow
  (`run-cycle.ts:34`), emits `cycle.start` (`run-cycle.ts:36`), creates
  the cycle branch + artifact dir (`run-cycle.ts:37`), iterates steps
  with `step.start` / `step.end` log events (`run-cycle.ts:48-66`),
  emits `cycle.end` on success (`run-cycle.ts:68`) or failure
  (`run-cycle.ts:63`). `finally` block (`run-cycle.ts:70-91`) always
  runs `checkoutBase` then `pullBase` and emits `cycle.checkout` +
  `cycle.base_pull`.
- Branch + base-pull helpers: `src/engine/branch.ts`. `createCycleBranch`
  (`branch.ts:17-23`) hardcodes `git checkout -b cycle/<workflow>/<slug>`
  — fails if the branch already exists. `checkoutBase` (`branch.ts:25-27`)
  and `pullBase` (`branch.ts:39-45`, `git fetch origin <base>` +
  `git merge --ff-only FETCH_HEAD`).
- Log writer (append-only): `src/engine/log.ts:8-18`. `createLogger`
  exposes `emit(event, fields)` that appends a JSON line to
  `.cycle/log.jsonl`. **No reader, no tail scanner exists today.**
- Cycle-id allocator: `src/engine/cycle-id.ts:4-18`. Already reads the
  full `log.jsonl` line-by-line and parses `cycle_id` — useful template
  for the resume-tail reader (also explains why a duplicate `cycle.start`
  for the same id at resume must not bump the allocator).
- Queue mutators: `src/engine/queue.ts`. `markInProgress`
  (`queue.ts:137-149`) is idempotent for a given `id`/`cycleId` (sets
  `status=in_progress`, writes `cycle_id`). `drainOk`
  (`queue.ts:151-155`), `drainFailedRetry` (`queue.ts:157-167`),
  `drainFailedTerminal` (`queue.ts:169-173`).
- Bash step runner: `src/engine/exec-bash.ts:12-33`. Spawns
  `/bin/bash <.cycle/command>` with `buildChildEnv`. No idempotency
  layer — re-running a step re-spawns the script.
- Claudecode step runner: `src/engine/exec-claudecode.ts:7-29`. Reads
  prompt from `.cycle/<promptPath>`, spawns `claude -p <prompt>`. No
  artifact-presence check; `run-cycle.ts:55-57` always overwrites
  `<STEP>.md` on success.
- Frontmatter mutator: `src/engine/frontmatter.ts:59-70`. `mutateFrontmatter`
  rewrites a file's frontmatter via tmp-file rename — used to stamp
  failure metadata, also reusable if resume needs to track
  attempts/state.
- Default scripts:
  - `src/defaults/scripts/commit.sh` — already restart-tolerant:
    `git diff --cached --quiet` short-circuits at
    `commit.sh:57-60` (`commit.sh: nothing to commit`, `exit 0`).
  - `src/defaults/scripts/pr.sh` — **not** restart-tolerant. Always
    calls `git push --set-upstream` (`pr.sh:11`) and `gh pr create`
    (`pr.sh:30`); no branch-PR lookup before create. `gh pr create`
    fails if a PR already exists for `branch`.
  - `src/defaults/scripts/verify.sh` — no state, re-runnable as-is.

### Existing Patterns to Follow

- Log emission shape: `{ts, event, ...fields}` JSONL, one event per
  line, emitted via `log.emit("event.name", fields)` —
  `src/engine/log.ts:13`. New events `engine.resume`, `step.resume`,
  etc. should follow this shape.
- Reading `log.jsonl` line-by-line: `src/engine/cycle-id.ts:5-17`
  already does forward scan + `JSON.parse` per line with try/catch on
  bad lines. A reverse-tail scan would be a near twin; can either read
  the whole file and walk from the end (simplest given current file
  sizes) or stream.
- `runCycle` accepts `cycleId?` override (`src/engine/run-cycle.ts:26`,
  `run-cycle.ts:31`). Resume can pass the in-flight `cycleId` so
  numbering doesn't bump and log events stay tied to the original
  cycle.
- Artifact dir creation is restart-tolerant: `mkdir(artifactDir,
  { recursive: true })` (`src/engine/branch.ts:21`).
- `finally` post-cycle base refresh already runs `git fetch` + ff
  merge (`src/engine/run-cycle.ts:84-90`, `src/engine/branch.ts:39-45`),
  which is the same operation SPEC asks for as the pre-resume action.
- Atomic frontmatter mutation pattern: write `tmp` then `rename`
  (`src/engine/frontmatter.ts:67-69`, also `src/engine/queue.ts:72-74`).
- Claudecode prompt steps' artifact file naming: uppercase step name +
  `.md` written to `docs/cycle/<cycle_id>-<workflow>-<slug>/`
  (`src/engine/run-cycle.ts:55-57`).

### Dependencies & Integration Points

- `src/cli.ts` is the only caller of `runCycle`. Today it allocates a
  fresh `cycleId` per pop (`cli.ts:130`). For resume, the CLI needs to
  detect an in-flight cycle **before** the pop loop and call `runCycle`
  with the existing `cycleId`, then continue into the normal triage →
  pop loop.
- `runCycle` always runs `wf.steps` from index 0 (`run-cycle.ts:48`)
  and unconditionally emits `cycle.start` (`run-cycle.ts:36`) and
  `createCycleBranch` (`run-cycle.ts:37`). Resume requires entering
  this function in a mode that:
  1. Skips the `cycle.start` emit (already in log) — or emits
     `cycle.resume` instead.
  2. Skips `git checkout -b` and instead checks out the existing
     branch.
  3. Starts iteration at the first step whose `step.end` is missing.
- `pr.sh` integration: the workflow step `pr` in
  `src/defaults/workflows.yml:23` is `agent: bash, command: scripts/pr.sh`.
  Restart tolerance requires editing `pr.sh` directly to detect an
  existing PR via `gh pr view --json number,state` keyed by branch
  before `gh pr create`.
- The skill template at `.claude/skills/cycle.md` and the dogfooded
  copy under `.cycle/` (via `npm run sync-defaults`) must reflect any
  default-file changes.
- Resume must coordinate with `markInProgress`/queue state: the
  `tbd.jsonl` row already carries `status: in_progress` and `cycle_id`
  for the in-flight item (`src/engine/queue.ts:6-15`,
  `cli.ts:131`). Resume should not re-`markInProgress` if the row
  already shows `in_progress` for that `cycle_id`. The queue row's
  `id` matches the in-flight `issue_id` recorded in the
  `cycle.start` event (`run-cycle.ts:36`).
- Triage runs at engine start (`cli.ts:60-71`). Per SPEC + RFC § 10,
  resume happens **before** triage when an in-flight cycle is
  detected; triage runs after resume completes.

### Test Infrastructure

- Test framework: Node's native `node:test` runner (no jest/vitest).
  Default reporter: spec. Coverage via `node --experimental-test-coverage`
  (`package.json`'s `test:coverage`). Runtime: Node ≥ 22.6,
  `--experimental-strip-types` for direct `.ts` execution.
- Layout: `tests/<area>/<file>.test.ts` mirroring `src/` (engine,
  cli, defaults, issue). Existing resume-adjacent tests:
  - `tests/engine/run-cycle.test.ts` — 9 tests, all driving `runCycle`
    end-to-end with tmpdir git repos, fake `claude` on PATH, and tiny
    workflow YAMLs (helper `workflowYml` at line 15).
  - `tests/engine/queue.test.ts` — round-trip + transitions for
    `tbd.jsonl`.
  - `tests/engine/log.test.ts` — sink + file write of the logger.
  - `tests/cli/multi-loop.test.ts` — exercises the full bundled
    `dist/cycle.js` via `spawnSync`, seeding `tbd.jsonl` + `todo/`
    rows directly (helper `seedTodoAndRow` at line 16, mirrors the
    BB-3 refactor that bypassed triage in tests).
  - `tests/cli/queue-drain.test.ts` and `tests/cli/triage.test.ts`
    follow the same `dist/cycle.js`-via-spawnSync pattern.
  - `tests/defaults/pr-auto-merge-fallback.test.ts` — static-source
    assertions over `pr.sh` (regex against the script body). Restart
    tolerance changes to `pr.sh` will likely need new regex tests
    plus, for behavior, a stubbed `gh` on PATH (consistent with how
    `claude` is stubbed elsewhere).
- Conventions: `mkdtemp(join(tmpdir(), "cycle-test-"))` for isolation;
  test cleanup in `finally` with `rm(root, { recursive: true, force: true })`;
  fake `claude` and shell tools written into a bin tmpdir prepended to
  `PATH` via `env`.
- Coverage baseline (per `CLAUDE.md`): line ≥ 95%, branch ≥ 75%,
  function ≥ 90%. BB-5 cannot drop these.

## Code References

- `src/cli.ts:44-71` — engine.start log emission and the early triage
  hook; the resume hook must land between `engine.start` and the
  first triage call.
- `src/cli.ts:100-187` — pop loop body; the resume path needs to slot
  in before this loop is entered, then naturally fall through.
- `src/cli.ts:130-138` — cycle id + `markInProgress` + `runCycle`
  invocation; for resume, `markInProgress` is likely a no-op and
  `cycleId` is passed explicitly.
- `src/engine/run-cycle.ts:31` — `cycleId` allocation with override
  hook used today by tests; resume reuses this hook.
- `src/engine/run-cycle.ts:36-37` — first emissions on cycle entry
  (`cycle.start` then `createCycleBranch`); resume must take a
  different code path here (no new `cycle.start`, no `checkout -b`).
- `src/engine/run-cycle.ts:48-66` — step loop; resume needs a
  `startStepIndex` (or filter against `completedSteps` derived from
  log) to skip already-finished steps.
- `src/engine/run-cycle.ts:70-91` — post-cycle `finally` already does
  `checkoutBase` + `pullBase`. SPEC's "refetch base branch (git fetch
  + ff merge)" pre-resume action is exactly `pullBase` —
  reuse it.
- `src/engine/branch.ts:17-23` — `createCycleBranch` always uses
  `checkout -b`; need an alternate `checkoutCycleBranch` (or a flag)
  for the resume path that calls `git checkout <branch>` against the
  pre-existing branch and `mkdir -p` on the artifact dir.
- `src/engine/log.ts:8-18` — current Logger is write-only. A
  `readLogTail` (or similar) needs to be added — likely in a new
  module or alongside the logger — that returns an in-flight cycle
  descriptor `{cycleId, workflow, slug, title, issueId, completedSteps}`
  or `null`.
- `src/engine/cycle-id.ts:4-18` — proven pattern for reading
  `log.jsonl` line-by-line with per-line try/catch.
- `src/engine/queue.ts:137-149` — `markInProgress` mutation; resume
  must tolerate calling it when the row is already `in_progress` for
  the same `cycle_id` (currently throws only on missing id, not on
  re-mark).
- `src/defaults/scripts/commit.sh:57-60` — restart-tolerant pattern to
  cite in SPEC/PLAN as the reference shape.
- `src/defaults/scripts/pr.sh:11,30` — the two non-idempotent
  operations that BB-5 must guard:
  - `git push --set-upstream origin "${branch}"` is safe to re-run
    (already-pushed branches just print up-to-date).
  - `gh pr create ...` is NOT — it errors when a PR exists for the
    branch. SPEC's resolution: detect existing PR by branch via
    `gh pr view "${branch}" --json number,state,url` and skip create
    when present, then fall straight into the polling/fallback merge
    block.
- `src/defaults/workflows.yml:14-23` — workflow step list; SPEC
  refers to "each workflow step must be restart-tolerant". The
  current list is `spec, research, plan, build, review, fix, verify,
  commit, pr`. Prompt steps overwrite their artifact via
  `writeFile` (`run-cycle.ts:55-57`) so they're tolerant by default;
  `verify.sh` is stateless; `commit.sh` is tolerant; only `pr.sh`
  needs script changes.

## Open Questions

- **Resume detection precision.** Walking from the tail, when is a
  cycle "in-flight"? Two cases per SPEC: (a) `cycle.start` with no
  matching `cycle.end`; (b) `step.start` with no matching `step.end`
  inside an unfinished cycle. Should `cycle.checkout` /
  `cycle.base_pull` (which fire in `finally` even on failure) count as
  cycle terminators? They emit *after* `cycle.end`, so the absence of
  `cycle.end` is sufficient — but the implementer should confirm and
  document the precedence rule.
- **Where to compute "last incomplete step".** Two options:
  (1) scan log tail, derive `completedSteps = set(step.end[step].step)`,
  pick first step in `wf.steps` not in that set; (2) find last
  `step.start` and re-run that step + all subsequent. RFC § 11 says
  "re-run from the last incomplete step", which option (2) describes.
  Plan step picks one.
- **What if `cycle.end status=failed` already emitted but the queue
  hasn't been drained yet?** RFC § 11 mentions only the
  `attempt ≥ max_cycle_attempts` edge. Need to define: does engine
  resume the failed cycle (re-running it), or treat it as a completed
  failure and move directly into the drain path that `cli.ts:155-184`
  performs? The text "last event is `cycle.end` (ok|failed) → fresh
  start" is implied by RFC § 11 but the edge of "cycle.end emitted,
  drain interrupted" is unspecified. Plan must decide.
- **In-flight cycle vs queue row mismatch.** If `tbd.jsonl` has been
  hand-edited between halt and resume so the in-flight row is gone
  (or a different row is `in_progress`), how does resume reconcile?
  Out of scope per RFC § 13, but plan should at minimum surface a
  clear error rather than silently re-create the row.
- **Existing PR detection contract for `pr.sh`.** Should the script
  use `gh pr list --head "${branch}" --json number,state,url --jq
  '.[0]'`, or `gh pr view "${branch}" --json ...` (already used at
  `pr.sh:31`)? Both work; plan picks one and any test fixture must
  stub it consistently.
- **`engine.resume` event shape.** SPEC implies a new log event but
  doesn't name it. Confirm whether resume should emit
  `engine.resume { cycle_id, from_step }` (recommended for
  observability + future tests) or piggy-back on the existing
  `cycle.start` / `step.start` events. Plan should decide before
  build.
- **Test seam for log-tail reader.** Current tests construct
  `log.jsonl` indirectly via `runCycle` end-to-end. A new
  pure-function tail reader (taking a file path or contents) is easier
  to unit-test; plan should decide whether to factor it that way.
```
