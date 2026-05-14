---
id: refl-0049-loadraws-faults-test-mis-named-exercises
source: reflection
title: loadRaws-faults-test-mis-named-exercises-unreachable-catch-via-runTriage
added_at: "2026-05-14T17:57:44.963Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0049"
---

`tests/engine/triage.faults.test.ts:369` is titled "loadRaws ENOENT on raw/ directory returns empty set" and the body `rm`s `rawDir` before calling `runTriage`. But `runTriage` calls `await mkdir(rawDir, { recursive: true })` at `src/engine/triage.ts:168` *before* `loadRaws` at `:170`, so the `readdir` ENOENT swallow at `:307-308` is unreachable through this entry point — `loadRaws` always sees a (just-created) empty directory. The test asserts a valid empty-set short-circuit, but its title implies it covers the ENOENT catch, which it does not.

Why it matters: future readers (and future `cycle` LLMs) will read the test name and assume the ENOENT catch is regression-tested. When somebody later removes or alters the mkdir-before-loadRaws contract (e.g., the loadRaws-isolation refactor in `[[loadraws-per-raw-isolation-gap-one-bad-raw-rejects-whole-pass]]`), the ENOENT catch may silently change behavior with no test alarming.

Suggested direction: either (a) rename the test to "loadRaws empty-set short-circuit" and accept that the ENOENT swallow is currently unreachable via `runTriage` (cheap, honest), or (b) call `loadRaws` directly in a unit test that does not run the upstream mkdir, so the ENOENT catch is actually executed. Either choice is small.
