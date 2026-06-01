---
id: txt-20260601-234500-port-failed-residue-dirty-worktree-guard
source: text
title: "Port a failed-cycle dirty-worktree residue guard into mainline cycle (halt before resume/next-issue on uncommitted residue)"
added_at: 2026-06-01T23:45:00.000Z
triage_attempts: 0
priority: high
---

PORT-BACK from a divergent cycle lineage. The `recon` project (sibling repo /mnt/c/Users/butters/wrk/recon) runs a customized cycle (vendored .cycle/bin/cycle.js, labeled 0.1.2) that has a FAILED-CYCLE DIRTY-WORKTREE RESIDUE GUARD which mainline cycle 0.1.10 does NOT have (confirmed: recon's engine has `formatFailedCycleResidueDiagnostic` + "Dirty worktree residue" messaging; mainline 0.1.10 has zero hits). Port the behavior into mainline.

WHY (real incident 2026-06-01): mainline cycle thrashed on cycles 0027/0028 — a failed cycle (review timed out via the claude -p exit-hang) left uncommitted dirty-worktree residue (partial BUILD artifacts, half-applied edits, issue-lifecycle moves), and the engine carried on to retries / the next pending issue ON TOP of that dirty tree, compounding the mess until a human had to `git reset --hard` to a clean commit. A residue guard would have caught this and halted cleanly instead.

DESIRED BEHAVIOR (mirror recon's guard; study recon's `.cycle/bin/cycle.js` + its test `tests/unit/cycle-failed-residue-guard.test.ts` for the exact contract):
- After a cycle ends in FAILURE, before (a) resuming/retrying that cycle or (b) popping the next pending issue, CHECK for dirty-worktree residue (`git status --porcelain`, scoped sensibly — exclude engine-owned runtime paths like the cycle log/queue).
- If residue is present, HALT with a clear diagnostic (`formatFailedCycleResidueDiagnostic`-style: name the residue paths, the failed cycle, and the remediation — commit/stash/reset) rather than starting new work on a dirty tree. Emit a distinct event (e.g. engine.halted { reason: "failed_cycle_residue" } or a step.warning) — never a silent proceed.
- Applies on BOTH the resume path and the next-pending-issue path (recon's test pins both: a resume guard and a loop guard).
- Consider interaction with trunk mode (where the engine works on the base branch directly — residue there is exactly the danger) vs worktree-pr mode.

DELIVERABLES: implement the guard in the engine (likely run-cycle.ts / the supervisor loop in cli.ts), with the diagnostic formatter; emit the halt/warn event; tests mirroring recon's (a failed cycle leaving uncommitted residue → engine halts before resume AND before next pending issue; clean tree → proceeds normally); docs (docs/ENGINE.md halt policy + CLAUDE.md). Cardinality-pin the halt event. Meet coverage floors. NOTE: study recon's implementation as the reference; adapt to mainline's current run-cycle/supervisor structure (it has diverged).
