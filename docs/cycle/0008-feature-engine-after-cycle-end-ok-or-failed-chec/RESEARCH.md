```markdown
# Research: Cycle 0008

## Cycle Context
SPEC.md for cycle 0008 is empty (1 byte; the spec step exited ok with empty stdout). The cycle directive comes from the issue body: after every `cycle.end` event (terminal status `ok` OR `failed`), the engine should checkout the repo back to the base branch (`CYCLE_BASE`, default `main`) so the working tree returns to a known state. Currently HEAD remains on `cycle/<workflow>/<slug>` locally, forcing a manual `git checkout master` between runs. The change lives in `src/engine/run-cycle.ts` post-cycle cleanup and must have test coverage for both ok and failed terminal states.

## Current Codebase State

### Relevant Components
- Engine orchestrator (drives a cycle end-to-end, emits `cycle.start` / `step.start` / `step.end` / `cycle.end`) — `src/engine/run-cycle.ts:18`
- Branch creation (currently the only git mutation in the engine; checks out `cycle/<workflow>/<slug>` via `git checkout -b`) — `src/engine/branch.ts:17`
- Inline git helper used by `createCycleBranch` (spawns `git` with `cwd: repoRoot`, `shell: false`, rejects on non-zero) — `src/engine/branch.ts:5`
- Step executors (bash and claudecode; both return `{ status, exitCode, stdout, stderr }`) — `src/engine/exec-bash.ts:12`, `src/engine/exec-claudecode.ts`
- Logger (appends to `.cycle/log.jsonl` and echoes via injectable sink) — `src/engine/log.ts:8`
- Workflow loader (reads `.cycle/workflows/<name>.yaml`) — `src/engine/workflow.ts:18`
- `CYCLE_BASE` env: defaulted to `"main"` inside `runCycle` env construction — `src/engine/run-cycle.ts:30`
- Consumers of `CYCLE_BASE` outside the engine: `src/defaults/scripts/pr.sh:8`, `src/defaults/scripts/pr.sh:13`

### Existing Patterns to Follow
- **Two terminal `cycle.end` emit sites in `run-cycle.ts`**: one on step failure (`run-cycle.ts:49`) and one on full success (`run-cycle.ts:54`). Any post-cycle cleanup must run after BOTH paths. The failure path currently uses early `return` from inside the `for` loop, so a `try/finally` or a wrapping helper is the natural structural fit.
- **Git invocation**: spawned directly (`spawn("git", args, { cwd: repoRoot, shell: false })`), with stderr captured and surfaced in error messages. Promise wrapper at `src/engine/branch.ts:5`. No use of `simple-git` or similar — keep the pattern.
- **Env resolution**: `CYCLE_BASE` is read from `process.env.CYCLE_BASE ?? "main"` at `run-cycle.ts:30` and stored on `cycleEnv`. The cleanup should use the SAME value (i.e. `cycleEnv.CYCLE_BASE`, not re-read process.env), so it matches what every step saw.
- **Step result shape**: `{ status: "ok" | "failed", exitCode, stdout, stderr }` (`exec-bash.ts:5`). The orchestrator only inspects `r.status`, never throws on step failure — it logs `cycle.end` and returns a structured `{ cycleId, status, failingStep? }`.
- **Logging**: every state transition gets a JSONL event via `log.emit(event, fields)`. A new "post-cycle checkout" action could either (a) be silent or (b) emit its own event — no current precedent for non-step engine events besides `cycle.start` / `cycle.end`.

### Dependencies & Integration Points
- `runCycle` is the public engine entrypoint imported by tests and (presumably) the CLI driver. Its return shape `{ cycleId, status, failingStep? }` is part of the contract — `src/engine/run-cycle.ts:50` / `:55`.
- `createCycleBranch` is the only function today that mutates git state. A checkout-back-to-base step would be a peer operation; placing it in `branch.ts` (e.g. exported `checkoutBase(repoRoot, base)`) would mirror the existing module layout.
- `CYCLE_BASE` is consumed by the default `pr.sh` script for `gh pr create --base` — `src/defaults/scripts/pr.sh:13`. The engine's choice of base must remain consistent with what the PR step uses (already shared via `cycleEnv`).
- Branch name format used to create the cycle branch: `cycle/${workflow}/${slug}` (`branch.ts:18`). The cleanup does not need to know the branch name — only the base — because `git checkout <base>` is sufficient.

### Test Infrastructure
- Test framework: `node:test` with `node:assert` strict mode.
- Test layout: mirror of `src/`, so engine tests live in `tests/engine/`. Files: `branch.test.ts`, `run-cycle.test.ts`, `exec-bash.test.ts`, `exec-claudecode.test.ts`, `child-env.test.ts`, `cycle-id.test.ts`, `log.test.ts`, `scan.test.ts`, `workflow.test.ts`.
- Test conventions:
  - Each test creates a real temp repo with `mkdtemp(tmpdir() + "cycle-test-")`, runs `git init -b main`, sets `user.email` / `user.name`, commits an empty initial commit. See `tests/engine/run-cycle.test.ts:16-22` and `tests/engine/branch.test.ts:17-21`.
  - A real `git` binary is invoked via `spawnSync("git", ...)` — no mocking of git.
  - `claude` is stubbed by writing a fake shell script into a temp bin dir and prepending it to `PATH` via `env: { PATH: ... }` passed to `runCycle` — `tests/engine/run-cycle.test.ts:35-37` / `:43`.
  - HEAD verification uses `git rev-parse --abbrev-ref HEAD` — `tests/engine/branch.test.ts:26`.
  - Cleanup in `finally` with `rm(root, { recursive: true, force: true })`.
- Current coverage of the change area:
  - `tests/engine/run-cycle.test.ts:15` covers a happy-path two-step workflow but does NOT assert post-cycle HEAD state.
  - `tests/engine/branch.test.ts:15` asserts that HEAD is on the cycle branch after `createCycleBranch`.
  - There is no test today exercising a failed-step path through `runCycle` (no fixture that forces a non-zero exit from a step and asserts the `failed` return + `cycle.end` failed event).

## Code References
- `src/engine/run-cycle.ts:18` — `runCycle` orchestrator entrypoint.
- `src/engine/run-cycle.ts:30` — `CYCLE_BASE` env construction with `"main"` default.
- `src/engine/run-cycle.ts:34-52` — step loop, early-return failure branch with `cycle.end status=failed`.
- `src/engine/run-cycle.ts:49` — failure-path `cycle.end` emission and return.
- `src/engine/run-cycle.ts:54-55` — success-path `cycle.end` emission and return.
- `src/engine/branch.ts:5` — internal `git()` promise helper (spawn + reject pattern to reuse for checkout-back).
- `src/engine/branch.ts:18-19` — branch name format `cycle/<workflow>/<slug>` and the `git checkout -b` that puts HEAD on the cycle branch.
- `src/engine/log.ts:8-18` — `createLogger` factory and `emit` semantics.
- `tests/engine/run-cycle.test.ts:15-57` — existing happy-path engine test (template for new ok / failed coverage).
- `tests/engine/branch.test.ts:26` — `git rev-parse --abbrev-ref HEAD` assertion pattern.
- `src/defaults/scripts/pr.sh:8` / `:13` — downstream consumer of `CYCLE_BASE`.

## Open Questions
- Should the post-cycle checkout emit its own log event (e.g. `cycle.checkout`) or be silent? No current precedent for engine-level non-step events besides `cycle.start` / `cycle.end`. The plan step should decide.
- If `git checkout ${CYCLE_BASE}` fails (e.g. dirty working tree, uncommitted changes left by a failing step), what is the desired behavior? Options: (a) swallow + log a warning event, (b) include the failure in the returned `{ status }`, (c) throw. The SPEC.md is empty, so the planner must pick. Note that the success path normally runs through `commit.sh` and `pr.sh`, leaving a clean tree; the failed path is the realistic dirty-tree case.
- Should the cleanup also handle the "HEAD is already on base" or "base branch does not exist" edge cases (e.g. the `runCycle` test uses `-b main` so `main` exists, but real repos may have differently-named defaults)?
- Where exactly should the helper live — inline in `run-cycle.ts`, or as a new export from `branch.ts` (mirroring `createCycleBranch`)? Either is consistent with the current style.
- Should the existing `run-cycle.ts` happy-path test be extended to assert HEAD == base, or should a new dedicated test file be added? The SPEC asks for "test for both ok + failed terminal states" — implies at minimum two test cases, likely co-located in `tests/engine/run-cycle.test.ts`.
```
