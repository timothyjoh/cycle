---
id: refl-0036-drainretry-within-budget-retry-path-is-n
source: reflection
title: drainRetry within-budget retry path is not residue-gated
added_at: 2026-06-03T04:47:40.213Z
triage_attempts: 0
priority: high
origin_cycle_id: "0036"
---

The new guard arms `pendingResidueContext` at the *terminal* failure branches but NOT on the within-budget retry path (`src/cli.ts:787` — the `else if (row.attempt + 1 < maxAttempts) { await drainRetry(...) }` arm). A build/spec/review step that fails mid-write, leaves uncommitted residue, and still has retry budget left will re-run on the next loop iteration with `pendingResidueContext` unset, so the loop-top `haltIfResidue()` is a no-op and the retry executes on top of the dirty tree.

This is the exact failure the cycle set out to prevent: SPEC's own motivating incident (cycles 0027/0028) describes the engine that "thrashed across retries ... on the polluted tree" — yet the retry path is precisely the one the guard does not cover. It's documented as the recon-parity `drainRetry` gap in docs/ENGINE.md, but not filed as an issue. Arming the residue context (or running the guard) before a within-budget retry would close it.
