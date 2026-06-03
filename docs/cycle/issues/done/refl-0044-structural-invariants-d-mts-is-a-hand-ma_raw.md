---
id: refl-0044-structural-invariants-d-mts-is-a-hand-ma
source: reflection
title: structural-invariants .d.mts is a hand-maintained type mirror with no
  drift check
added_at: 2026-06-03T16:40:22.412Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0044"
---

Cycle 0044 added `scripts/structural-invariants.d.mts` — a hand-written declaration surface (`Invariant`, `INVARIANTS`, `runInvariants`) — purely so the TS test can statically import the `.mjs` export under `tsc --noEmit`. Nothing ties this `.d.mts` to the real `.mjs` exports: a future change to `runInvariants`'s signature or the `INVARIANTS` entry shape can silently drift from the declaration. Worst case, the test type-checks against stale types that no longer match runtime, eroding the very guarantee this cycle set out to add.

This is exactly the hand-maintained-mirror anti-pattern the repo elsewhere eliminates with derivation (`ARTIFACT_STEPS` from `STEP_ARTIFACTS` keys, `knownAgents()` from `REGISTRY`) or machine-checks (the `AGENT_BINARY` and residue arm→persist structural invariants). Suggested direction: drop the separate `.d.mts` in favor of JSDoc `@typedef`/`@param` annotations in `structural-invariants.mjs` under `checkJs`/`allowJs`, so the types live with the implementation and drift becomes a typecheck failure rather than a silent gap.
