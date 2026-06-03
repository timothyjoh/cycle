---
id: refl-0042-no-structural-invariant-pins-residue-per
title: Add structural invariant pinning every residue-arming site to a
  persistResidue call
workflow: feature
depends_on: []
triaged_at: 2026-06-03T13:33:10.495Z
source: triage
priority: medium
---
## Problem

Cycle 0042 added the fifth `persistResidue(pendingResidueContext)` call by hand so that every loop-back branch which arms residue context in memory also mirrors it to `.cycle/failed-residue-context.json`. But the arm→persist pairing is enforced only by prose in `CLAUDE.md` / `docs/ENGINE.md` ("five persist sites"). The sole residue-related structural invariant in `scripts/structural-invariants.mjs` counts `haltIfResidue()` *check* sites (3), not *persist* sites.

A future cycle that adds a new terminal-failure / loop-back branch and sets `pendingResidueContext = { ... }` in `src/cli.ts` without a following `await persistResidue(...)` would silently reopen the crash-safety hole that cycles 0039 and 0042 spent two cycles closing — and nothing in the gate would catch it.

## Ask

Add an invariant to `scripts/structural-invariants.mjs` (extend the `INVARIANTS` table — the single source of truth) that asserts every *arming* assignment in `src/cli.ts` — `pendingResidueContext = { ... }` assigned a non-undefined object literal — is immediately followed by `await persistResidue(...)`. This keeps the arm/persist correspondence machine-checked instead of doc-maintained.

## Constraints / notes

- **Whitelist the two intentionally-unpersisted arming sites**: the tail-derived resume/startup paths (around `src/cli.ts:650`) reconstruct residue context from the in-flight log tail, so they need no `.cycle/failed-residue-context.json` mirror. The invariant must explicitly allow these rather than count a flat total — counting a fixed number is brittle and re-introduces the same doc-drift problem one layer down.
- Do not change residue-guard runtime behavior; this is a build-time structural check only.
- Follow the existing `INVARIANTS`-table conventions and the per-file coverage policy. Enforced via `npm run check:invariants` (runs automatically after `test:coverage`).
- Keep the failure message actionable: name the offending arming line and point at the persist/arm contract so a future author knows exactly what to add.
