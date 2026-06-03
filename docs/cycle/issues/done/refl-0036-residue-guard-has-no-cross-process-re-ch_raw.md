---
id: refl-0036-residue-guard-has-no-cross-process-re-ch
source: reflection
title: residue guard has no cross-process re-check after terminal-failure restart
added_at: 2026-06-03T04:47:40.213Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0036"
---

The guard is in-process only. The resume path arms from the log tail, but `readLogTail` only returns a tail for an *in-flight* cycle (a `cycle.start` with no matching `cycle.end`). After a cycle that ended in terminal failure (a `cycle.end {status: failed}` is present), a full engine restart finds no in-flight tail, never arms `pendingResidueContext`, and the `while (!halted)` loop pops the next pending issue on top of any residue with no check.

For an AFK operator this is the realistic recovery path (engine dies, gets relaunched), so the protection silently doesn't apply across restarts. Recon's lineage solves this with a `.cycle/failed-residue-context.json` startup re-check; mainline explicitly deferred it to a sibling cycle (documented in ENGINE.md/CLAUDE.md) but it is not yet filed. A startup-time worktree check is the natural follow-up.
