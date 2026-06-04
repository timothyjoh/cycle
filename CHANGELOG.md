# Changelog

Notable changes to **cycle**. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Releases before 0.2.0 are recorded in the git tag history (`v0.0.3` … `v0.1.16`).

## [0.2.0] — 2026-06-04 — *Resilience is the precondition for autonomy*

The 0.2 milestone makes away-from-keyboard delivery **trustworthy**: cycle now recovers
from its own failures, finishes-or-fails-loudly, and leaves a durable, auditable trail —
so you can fill a queue, walk away, and trust the result. Much of 0.2 was built by cycle
working autonomously on its own codebase.

### Self-healing execution
- **Failed cycles wipe their own work and restart clean.** When a step fails, the engine
  reverts every non-engine-owned change, removes new files, wipes the cycle's docs, and
  re-runs the cycle from step 1 — up to `max_cycle_attempts` (default 3). A flaky cycle now
  recovers itself instead of leaving a dirty tree.
- **Dead issues park, the queue keeps flowing.** A cycle that exhausts its attempts drains
  to `failed/` and the engine continues to the next issue; it halts only after
  `max_consecutive_failures` (default 2) *distinct* terminal failures. One broken issue no
  longer blocks the whole backlog.
- **Crash recovery self-heals.** The resume path tears down and restarts a mid-cycle-crashed
  attempt cleanly instead of halting on residue.
- The dirty-worktree **residue guard is now a fallback** (it fires only when teardown can't
  clean the tree, or at startup after a crash) — not a constant halt on every failed cycle.
- **Per-step wall-clock timeout + complete-artifact salvage**, an **iteration-too-fast guard**
  against instant-failure loops, and **rate-limit retry/backoff** with a bounded retry cap.

### Quality gates — no silent success
- **Completion-proof post-condition** — a step that exits `0` but produced an empty artifact
  is a failure, not a silent pass.
- **Anti-slop empty-diff guard** and **verify-before-commit**.
- **No-op / already-satisfied detection** (research and build phases) resolves issues whose
  work is already done to a distinct outcome instead of burning the failure budget.
- **`expects_code: false`** doc-only opt-out for research/documentation issues.
- **Failed bash-step stdout capture** and verify-output capture — honest observability into
  *why* something failed without re-running by hand.

### State of record
- `.cycle/log.jsonl` and `.cycle/tbd.jsonl` are now **git-tracked and committed each cycle**,
  so run history and the live queue travel with the repository.
- **Monotonic cycle-id derivation** (max of existing cycle dirs + the log) survives a fresh
  clone — no more counter restarts or colliding cycle directories.

### Agent fleet
- Six interchangeable agent lanes: **claudecode, codex, gemini, auggie, opencode, pi**.
- Top-level **`defaults: { agent, model, thinking }`** block in `workflows.yml`, overridable
  per step; `--model` forwarding; documented per-agent model contracts ([docs/models.md](docs/models.md)).
- **Non-TTY-safe entrypoints** for every lane (`codex exec`, `opencode run`, `pi --print`),
  so agents that gate interactive mode on a TTY no longer break on piped stdin.
- Hermetic `CYCLE_<AGENT>_BIN` test overrides; per-agent test/binary hermeticity invariants.

### Engine-start safety & operability
- **Preflight gate** — probes every agent CLI + required tool before the first cycle and
  halts cleanly if something's missing.
- **Resolvable shell** — git-bash / WSL auto-discovery, or `engine.shell` / `CYCLE_SHELL`.
- **`cycle upgrade`** — non-destructive in-place engine refresh for an initialized repo.
- Opt-in **command-output compression** for claudecode steps (`engine.compress_output`).
- **Walkthrough capture** — screenshots/video recorded as first-class cycle artifacts via a
  repo-provided hook.
- Build-time **structural invariants** + per-file **coverage floors** guarding the engine's
  own guarantees.

### Ecosystem
- cycle pairs with **[maestro](https://github.com/timothyjoh/maestro)** — a chat-first,
  event-sourced control plane that observes and orchestrates a *fleet* of cycle engines
  across many repositories. cycle is the engine; maestro is the layer above it.

> Prior 0.1.x / 0.0.x history: see the git tags `v0.0.3` … `v0.1.16`.
