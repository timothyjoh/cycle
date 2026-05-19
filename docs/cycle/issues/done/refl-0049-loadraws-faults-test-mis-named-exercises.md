---
id: refl-0049-loadraws-faults-test-mis-named-exercises
title: Fix mis-named loadRaws ENOENT test in triage.faults.test.ts (rename or call loadRaws directly)
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T17:59:34.973Z"
source: triage
---
## Problem

`tests/engine/triage.faults.test.ts:369` is titled `"loadRaws ENOENT on raw/ directory returns empty set"` and the body `rm`s `rawDir` before calling `runTriage`. But `runTriage` calls `await mkdir(rawDir, { recursive: true })` at `src/engine/triage.ts:168` **before** `loadRaws` at `:170`, so the `readdir` ENOENT swallow at `src/engine/triage.ts:307-308` is unreachable through this entry point. `loadRaws` always sees a (just-created) empty directory.

The test asserts a valid empty-set short-circuit, but its title implies it covers the ENOENT catch — it does not.

## Why it matters

Future readers (and future `cycle` LLM agents) will read the test name and assume the ENOENT catch is regression-tested. When somebody later removes or alters the mkdir-before-loadRaws contract in `runTriage` (e.g., the upcoming loadRaws per-raw isolation refactor surfaced in `refl-0049-loadraws-per-raw-isolation-gap-one-bad-r`), the ENOENT catch may silently change behavior with no test alarming.

## Acceptance

Pick one of two cheap directions and land it:

- **(a) Rename only.** Retitle the existing test to `"loadRaws empty-set short-circuit via runTriage"` (or similar) so the name matches what the test actually exercises. Add a one-line comment in the test body noting that the ENOENT catch at `triage.ts:307-308` is currently unreachable through `runTriage` because of the upstream `mkdir(rawDir, { recursive: true })`.
- **(b) Cover the catch.** Add a focused unit test that imports `loadRaws` directly (or exposes it via a test-only export) and runs it against a non-existent `rawDir`, asserting it returns an empty set. The existing `runTriage`-level test stays as-is but gets the rename from (a) so it stops misadvertising coverage.

Either path is fine; pick (a) unless `loadRaws` is already exported / trivially exportable, in which case (b) is strictly better. Update the test name **and** ensure no other test under `tests/engine/triage.faults.test.ts` re-asserts the unreachable-via-`runTriage` claim.

## Notes for the build agent

- Do not weaken the existing `mkdir(rawDir, { recursive: true })` upstream of `loadRaws` — that mkdir is load-bearing for the normal happy path.
- If you choose (b), keep the new direct-`loadRaws` unit test in `triage.faults.test.ts` next to its sibling so coverage of `src/engine/triage.ts:307-308` is colocated with the rest of the loadRaws fault coverage.
- Confirm `npm run test:coverage` still passes the `src/engine/triage.ts ≥ 95%` per-file floor; this change should hold or improve that number, not regress it.
