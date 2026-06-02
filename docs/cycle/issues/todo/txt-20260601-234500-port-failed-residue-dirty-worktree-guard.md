---
id: txt-20260601-234500-port-failed-residue-dirty-worktree-guard
title: Port a failed-cycle dirty-worktree residue guard into mainline (halt
  before resume/next-issue on uncommitted residue)
workflow: feature
depends_on: []
triaged_at: 2026-06-02T00:09:32.146Z
source: triage
priority: high
---
Port the **failed-cycle dirty-worktree residue guard** from the divergent `recon` cycle lineage into mainline cycle. The `recon` project (sibling repo `/mnt/c/Users/butters/wrk/recon`) runs a customized, vendored cycle (`.cycle/bin/cycle.js`, labeled 0.1.2) that has this guard; mainline 0.1.10 does not (confirmed: recon's engine has `formatFailedCycleResidueDiagnostic` + "Dirty worktree residue" messaging; mainline has zero hits).

## Why (real incident, 2026-06-01)

Mainline cycle thrashed on cycles 0027/0028: a failed cycle (review timed out via the `claude -p` exit-hang) left uncommitted dirty-worktree residue — partial BUILD artifacts, half-applied edits, issue-lifecycle moves. The engine then carried on to retries and the next pending issue **on top of that dirty tree**, compounding the mess until a human had to `git reset --hard` back to a clean commit. A residue guard would have caught this and halted cleanly.

## Reference implementation

Study recon's guard as the reference, but **adapt** to mainline's current `run-cycle.ts` / supervisor (`src/cli.ts`) structure — the lineages have diverged, so do not copy verbatim:
- recon `.cycle/bin/cycle.js` — `formatFailedCycleResidueDiagnostic` and the "Dirty worktree residue" halt path.
- recon `tests/unit/cycle-failed-residue-guard.test.ts` — the exact behavioral contract (it pins both a resume guard and a loop/next-issue guard).

## Desired behavior (mirror recon's guard)

- After a cycle ends in **failure**, and before either (a) resuming/retrying that cycle or (b) popping the next pending issue, **check for dirty-worktree residue** via `git status --porcelain`, scoped sensibly — exclude engine-owned runtime paths (the cycle log/queue, e.g. `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, and any other engine-managed state) so the engine's own bookkeeping never trips the guard.
- If residue is present, **HALT** with a clear diagnostic (`formatFailedCycleResidueDiagnostic`-style): name the residue paths, the failed cycle id, and the remediation (commit / stash / `git reset --hard`). Emit a distinct, cardinality-pinned event — e.g. `engine.halted { reason: "failed_cycle_residue" }` (or a `step.warning`) — **never a silent proceed**.
- The guard applies on **both** paths: the resume/retry path and the next-pending-issue loop path (recon's test pins both).
- Account for commit-mode interaction: in **trunk mode** the engine works on the base branch directly, so residue there is exactly the danger this guards against; in **worktree-pr mode** consider where residue can accumulate and scope the check accordingly. This repo runs trunk mode (`CYCLE_TRUNK_BASED=1`), so trunk is the primary path to get right.

## Deliverables

- Implement the guard in the engine (likely `src/engine/run-cycle.ts` and/or the supervisor loop in `src/cli.ts`), with a dedicated diagnostic formatter (`formatFailedCycleResidueDiagnostic`-equivalent).
- Emit the halt/warn event; **cardinality-pin** it per the test convention (`filter(predicate).length === 1`, or `expectExactlyOne`).
- Tests mirroring recon's: a failed cycle leaving uncommitted residue → engine halts **before resume** AND **before the next pending issue**; a clean tree → engine proceeds normally. Cover the path-scoping exclusion of engine-owned runtime files.
- Docs: `docs/ENGINE.md` halt-policy section and `CLAUDE.md` (new halt reason / guard description).
- Meet coverage floors (add tests in the same cycle); add a per-file floor / structural invariant entry if a new module is introduced.
