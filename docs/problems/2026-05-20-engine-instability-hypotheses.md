# Engine instability hypotheses

**Date:** 2026-05-20
**Symptom:** cycle intermittently "spins out of control" (burns retries / loops with no progress) or "dies" (hangs, halts, or exits) with no clear cause.

This is a code-scan diagnosis, not a confirmed root cause. Each hypothesis lists the evidence, the failure mechanism, and a cheap way to confirm or rule it out. Ordered roughly by likelihood × blast radius.

---

## H1 — No subprocess timeout: a hung agent hangs the whole engine

**Evidence:**
- `src/engine/exec-spawn.ts:14` declares an optional `signal?: AbortSignal`, but `src/engine/run-cycle.ts:297` calls `mod.runStep({ repoRoot, promptPath, env, model, thinking })` — **no signal is ever created or passed**.
- `runAgent` resolves only on child `close`/`error` events. There is no timer, no watchdog, no max-duration.

**Mechanism:** If any agent CLI (`claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi`) hangs — waiting on stdin, blocked on a network call, stuck in its own retry loop — the step Promise never resolves. The cycle hangs forever. From the outside this looks like cycle "died": no log line, no exit, no progress.

**Confirm:** When it next hangs, `ps` for the child agent process and check if it's alive but idle. Check `.cycle/log.jsonl` for a `step.start` with no matching `step.end`.

**Likely fix direction:** wire an `AbortController` with a per-step timeout from config through `runStep` → `runAgent` (the plumbing already accepts `signal`).

---

## H2 — `.cycle/.env` is never loaded: `CYCLE_TRUNK_BASED` silently ignored

**Evidence:**
- `CLAUDE.md` states: *"Trunk-based operation is enforced via `CYCLE_TRUNK_BASED=1` in `.cycle/.env`."*
- Grep for `.env` loading across `src/` finds **nothing** that reads `.cycle/.env`. The only writer of the flag is `src/cli.ts:125` (`if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1"`) and the only reader is `src/engine/workflow.ts:86`.
- Shipped default `src/defaults/workflows.yml:7` is `mode: worktree-pr`.

**Mechanism:** If the operator relies on `.cycle/.env` (as CLAUDE.md instructs) rather than passing `--trunk` or exporting the var in their shell, the flag is never set. `loadConfig` then leaves `commit.mode = worktree-pr`. The engine starts creating cycle branches / worktrees instead of committing to `master` — directly contradicting the documented "edit master directly" workflow. Branch churn, unexpected checkouts, and `cycle.checkout`/`cycle.base_pull` failures follow. This also explains intermittence: behavior depends entirely on how that particular invocation got its env (interactive shell vs. cron/daemon vs. `--trunk`).

**Confirm:** `grep CYCLE_TRUNK_BASED .cycle/.env` (exists?) then check a recent `cycle.start`/`cycle.checkout` log entry — does it say `reason: "trunk"` (H2 ruled out) or is it doing worktree-pr branch checkouts (H2 confirmed)?

**Likely fix direction:** actually load `.cycle/.env` at engine bootstrap, OR change CLAUDE.md + defaults to stop pretending `.cycle/.env` is read.

---

## H3 — Unbounded stdout buffering: a chatty/runaway agent blows memory

**Evidence:**
- `src/engine/exec-spawn.ts:32` accumulates `stdout += d.toString()` (and `stderr` likewise) with **no cap**.

**Mechanism:** An agent that emits a very large or infinite stream (a loop printing, a stack-trace storm) grows the buffer until Node's heap is exhausted and the OS kills the process. This presents as cycle "dying" abruptly with no graceful log line. Pairs nastily with H1 (no timeout means the runaway has unlimited time to fill memory).

**Confirm:** Check `dmesg`/Console for OOM kills around a death; check whether the dying step is one whose agent can produce large output. Inspect peak RSS of the run-one child.

**Likely fix direction:** cap accumulated bytes (truncate-head like `truncateHeadCapped` already used for log stderr) and/or stream to a temp file.

---

## H4 — cycle_id reuse on retry + skip-gate masks a stuck spec/plan

**Evidence:**
- `src/engine/queue.ts:161 drainFailedRetry` increments `attempt` but **intentionally preserves `cycle_id`** (comment lines 167–171).
- `src/engine/run-cycle.ts:33` `SKIP_ELIGIBLE_STEPS = {spec, research, plan}`; `:225`–`236` skips those steps on `attempt > 0` whenever a non-empty `<STEP>.md` artifact exists in the reused `artifactDir`.

**Mechanism:** If attempt 0 writes a *non-empty but bad* `SPEC.md`/`PLAN.md`, every retry skips re-generating it (the artifact is present and >0 bytes) and re-runs the same downstream `build`/`fix` against the same bad plan. Each retry fails the same way. Retries are consumed with zero new information until `max_cycle_attempts` is hit → terminal failure → counts toward halt. Looks like "spinning."

**Confirm:** In a stuck cycle's log, look for repeated `step.skipped {reason: "artifact_present", step: "spec"|"plan"}` across attempts followed by the same `step.end status: failed` on `build`/`fix`.

**Likely fix direction:** add a post-condition that re-validates skipped artifacts, or invalidate the artifact when a downstream step fails for the same reason twice.

---

## H5 — Fragile resume: a dangling `cycle.start` makes every run try to resume a zombie

**Evidence:**
- `src/engine/log-tail.ts:21 parseLogTail` returns an in-flight cycle = the **last `cycle.start` with no matching `cycle.end`**.
- `src/cli.ts:399`–`420` runs `runResumeOnce` for that tail before draining new work.
- There is **no signal handler** in current `src/cli.ts` (grep for SIGINT/SIGTERM/gracefulStop finds nothing) — so a `cycle.end` is never written if the process is killed (SIGKILL, crash, laptop sleep, OOM from H3).

**Mechanism:** A hard-killed run leaves (a) a dangling `cycle.start` in the log and (b) an `in_progress` row in `tbd.jsonl`. The next `cycle run` re-enters the resume path. If the working tree / branch was left mid-mutation, resume runs against inconsistent state. The `resume_row_mismatch` guard (`:287`) catches some cases, but when the row is still `in_progress` with the matching `cycle_id`, resume proceeds — potentially re-failing every invocation against the same zombie cycle.

**Confirm:** After a "death", inspect the tail of `.cycle/log.jsonl` for a `cycle.start` with no `cycle.end`, and `cycle status` for a stuck `in_progress` row. See whether subsequent runs emit `engine.resume` for the same `cycle_id` repeatedly.

**Likely fix direction:** add SIGINT/SIGTERM handlers that write a terminal `cycle.end {status:"interrupted"}`, and/or a staleness timeout on resume.

---

## H6 — `max_consecutive_failures: 2` halts on unrelated transient failures

**Evidence:**
- `src/cli.ts:163` default `maxConsecutiveFailures = 2`.
- Several hard post-condition guards turn a single agent hiccup into a terminal cycle failure: spec-min-bytes (`run-cycle.ts:309`), empty-diff guard (`:328`), fix-vs-must-fix guard (`:317`).
- `git push` failure also counts: `commit-cycle.ts:196` retries 3× then returns `push_failed`, which the supervisor (`cli.ts:496`) treats as a failed cycle.

**Mechanism:** Two *independent* transient failures (an agent rate-limit, a flaky test, a momentary `git push` race) trip `engine.halted {reason: max_consecutive_failures}`. The whole queue stops even though nothing is fundamentally broken. "Dying and we don't know why" = a terse `engine.halted` after two unrelated blips.

**Confirm:** Inspect the two `cycle.end status:failed` entries before a halt — are their `failing_step`s unrelated (e.g. one `push`, one `spec`)? That points to transient-noise halting rather than a real defect.

**Likely fix direction:** distinguish transient (push/network) from deterministic (post-condition) failures; only count deterministic ones, or raise the threshold.

---

## H7 — No concurrency guard on the supervisor: two runs race the same row

**Evidence:**
- `popNextPending` (`queue.ts:129`) then `markInProgress` (`:137`) is **not atomic** — read, then a separate write.
- No PID/lockfile guards the `cycle run` supervisor itself (only `.cycle/cycle.pid` appears as a *commit-denylist* entry in `path-utils.ts:2`, not as a runtime mutex).
- `.claude/scheduled_tasks.lock` shows as modified in git status — suggests a scheduler/loop may launch `cycle run` on a timer.

**Mechanism:** If a scheduled/looped `cycle run` fires while a previous one is still working, both can `popNextPending` the same pending row. Both allocate (different) `cycle_id`s. The second `markInProgress` throws (`:142` "already in_progress … refusing to overwrite") — and that throw is unhandled in the main loop, crashing that supervisor. Meanwhile two run-one children may mutate the same working tree concurrently. Classic "spins out of control."

**Confirm:** Check whether more than one `cycle`/`node … run` process is ever alive simultaneously (`ps`). Look for an unhandled `markInProgress: row … already in_progress` rejection in stderr/logs.

**Likely fix direction:** an exclusive runtime lock (PID lockfile with liveness check) at the top of the `cycle run` supervisor.

---

## Quick triage checklist for the next incident

1. `tail .cycle/log.jsonl` — last event type? (`step.start` w/o end ⇒ H1/H5; `engine.halted` ⇒ H6; nothing ⇒ H3 OOM)
2. `cycle status` — stuck `in_progress` row? (⇒ H5/H7)
3. `grep CYCLE_TRUNK_BASED .cycle/.env` and check `cycle.checkout` reason — trunk vs worktree-pr? (⇒ H2)
4. `ps` — agent child alive-but-idle (H1) or multiple supervisors (H7)?
5. Repeated `step.skipped {artifact_present}` across attempts? (⇒ H4)
