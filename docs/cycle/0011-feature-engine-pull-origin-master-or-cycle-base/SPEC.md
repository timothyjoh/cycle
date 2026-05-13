```markdown
# SPEC — Cycle 0011: Pull origin/CYCLE_BASE between cycles

## Objective
Refresh local `CYCLE_BASE` from `origin` after each cycle checks back out
to it, so the next cycle branches from the up-to-date remote tip. Today
the engine returns HEAD to `CYCLE_BASE` (added in cycle 0008) but never
fetches; if the prior cycle's PR was merged remotely, the next cycle
branches off a stale local tip and the PR comes up CONFLICTING (the bug
that forced manual cherry-pick + PR #12 in cycle 0009).

## Source Issue
`txt-20260513-020016-engine-pull-origin-master-or-cycle-base` — "engine:
pull origin/master (or CYCLE_BASE) between cycles after checkout-back,
before creating the next cycle's branch."

## Scope

### In Scope
- In `src/engine/run-cycle.ts`, after `checkoutBase(...)` in the
  `finally` block, fast-forward the local base to the remote tip via
  `git fetch origin <CYCLE_BASE>` then `git merge --ff-only FETCH_HEAD`.
- Emit a single new log event capturing the result of that fast-forward
  (ok / failed + reason), so the audit log shows whether the base was
  refreshed between cycles.
- Tests covering the success path (remote ahead → local fast-forwards)
  and the no-op / failure path (no remote, or non-ff diverge → engine
  does not crash; event records the failure).

### Out of Scope
- Changing branch protection, PR auto-merge logic, or `pr.sh`.
- Cleaning up the just-completed cycle's local feature branch.
- Pulling on cycle *start* if there has been no prior cycle in the run.
- Handling a divergent local base (non-fast-forward). Logged as failed;
  next cycle proceeds from whatever HEAD is at, same as today.

## Requirements
- Fetch + ff-merge happens **after** `checkoutBase` succeeds and
  **before** `runCycle` returns, so the next `runCycle` invocation calls
  `createCycleBranch` against the refreshed base.
- A `git fetch` or `git merge` failure must not throw out of `runCycle`
  — the cycle result (ok/failed) must remain whatever the workflow
  produced. The pull is best-effort and observable via the log.
- Subprocess discipline preserved: `spawn` with array args, no
  `shell: true`, no `exec`.
- Operates against `cycleEnv.CYCLE_BASE` (same value used by
  `checkoutBase`), not a hard-coded `main`/`master`.
- Quiet on stdout — no engine chatter; only the JSONL event records the
  outcome.

## Acceptance Criteria
- [ ] After a successful cycle, `.cycle/log.jsonl` contains a new event
      (e.g. `cycle.base_pull`) with `status: "ok"`, `base`, and the SHA
      moved-from / moved-to (or an equivalent indicator that ff
      happened).
- [ ] When `origin/<CYCLE_BASE>` is ahead of local, the local base is
      fast-forwarded to it before `runCycle` returns.
- [ ] When the fetch or ff-merge fails (no remote, diverged history,
      offline), `runCycle` still returns its normal result and the log
      event shows `status: "failed"` with a `reason`.
- [ ] Existing `cycle.checkout` event still emitted with current shape.
- [ ] All existing tests pass; `npm run typecheck` clean.
- [ ] Coverage does not regress below the master baseline (line ≥ 95%,
      branch ≥ 75%, func ≥ 90%).

## Testing Strategy
- Node native test runner (existing convention in `tests/`).
- New test in `tests/engine/run-cycle.test.ts` (or a sibling) wiring up
  two local git repos as `origin` + working clone:
  - **Success path:** seed `origin` ahead of local on `CYCLE_BASE`, run
    `runCycle` end-to-end with a trivial bash-only workflow, assert
    local base SHA after cycle == remote tip SHA, and assert the new
    log event is present with `status: "ok"`.
  - **No-remote / failure path:** point at a missing remote (or force a
    diverge so ff-only refuses), assert `runCycle` still returns
    successfully and the log event records `status: "failed"`.
- No e2e UI tests required — engine-internal change.

## Documentation Updates
- **CLAUDE.md**: no command surface changes; update only if the
  Architecture quick reference enumerates run-cycle responsibilities
  (it does not today — skip unless the section is touched).
- **README.md**: no user-facing surface change; skip.
- **`.cycle/log.jsonl` event vocabulary**: the new event name lands in
  the engine source; if `docs/ARCHITECTURE.md` enumerates events, add
  the new one there.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `git` available in `PATH` (already a hard runtime requirement).
- `origin` remote configured on the working repo. When absent, the new
  step degrades to a logged failure rather than a crash.
- No new env vars. Reuses existing `CYCLE_BASE`.
```
