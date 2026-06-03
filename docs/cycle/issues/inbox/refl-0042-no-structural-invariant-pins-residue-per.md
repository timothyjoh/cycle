---
id: refl-0042-no-structural-invariant-pins-residue-per
source: reflection
title: no-structural-invariant-pins-residue-persist-sites-to-arming-branches
added_at: 2026-06-03T13:29:04.291Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0042"
---

Cycle 0042 added the fifth `persistResidue(pendingResidueContext)` call by hand so every loop-back branch that arms residue context in memory also mirrors it to `.cycle/failed-residue-context.json`. But the pairing is enforced only by prose in CLAUDE.md / docs/ENGINE.md ("five persist sites") — the sole residue-related structural invariant counts `haltIfResidue()` check sites (3), not persist sites. A future cycle that adds a new terminal-failure/loop-back branch and sets `pendingResidueContext = {...}` (src/cli.ts) without a following `persistResidue` would silently reopen the exact crash-safety hole that cycles 0039 and 0042 spent two cycles closing, and nothing in the gate would catch it.

Add an invariant to scripts/structural-invariants.mjs that asserts every *arming* assignment (`pendingResidueContext = { ... }` with a non-undefined object) is immediately followed by `await persistResidue(...)`. Note the two intentionally-unpersisted arming sites are the tail-derived ones (the resume/startup paths around src/cli.ts:650 reconstruct context from the in-flight log tail, so they need no mirror) — the invariant must whitelist those rather than count a flat total. This keeps the persist/arm correspondence machine-checked instead of doc-maintained.
