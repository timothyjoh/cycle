# Must-Fix Items: Cycle 0015

## Summary
2 critical issues (integration-test gaps that miss SPEC acceptance items),
3 minor issues (design deviations + a hygiene leak). Coverage and unit
tests are clean; everything below is targeted at closing acceptance-criteria
gaps and removing avoidable footguns.

## Tasks

- [x] ### Task 1: Integration test must assert `tbd.jsonl` rows and ordering
  **Status:** ✅ Fixed
  **What was done:** Added a post-`run` reconstruction of queue state from
  `cycle.start` events in `.cycle/log.jsonl`. The new assertion checks the
  exact ordering: `assert.deepEqual(cycleStarts, [aId, bId])`. The
  pre-existing `rawOk.children` deepEqual on `[aId, bId]` is preserved.
  Manually broke ordering in the fake claude (`[b, a]`) and confirmed the
  new assertion catches it before reverting.

- [x] ### Task 2: Integration test must assert `run` exit code
  **Status:** ✅ Fixed
  **What was done:** Bound `spawnSync` return as `run` and added
  `assert.equal(run.status, 0, ...)` with stdout+stderr in the failure
  message. Verified the assertion fires by temporarily exiting non-zero
  from the fake claude.

- [x] ### Task 3: Integration test must verify todo files exist with correct frontmatter
  **Status:** ✅ Fixed
  **What was done:** Added a "child appears exactly once in todo/+done/"
  assertion for both `aId` and `bId`. Then parsed the frontmatter of the
  `a` child (whichever directory it lives in) and asserted `fm.id`,
  `fm.parent === rawId`, `fm.workflow === "feature"`,
  `Array.isArray(fm.depends_on)`, `typeof fm.triaged_at === "string"`,
  `fm.source === "triage"`.

- [x] ### Task 4: Document the per-raw vs. batch-prompt deviation
  **Status:** ✅ Fixed
  **What was done:**
  1. `CLAUDE.md:38` now includes "...invokes the agent once per raw so
     each call sees only that raw plus the current queue; cross-raw
     batching is deferred."
  2. Appended a "Deviations from SPEC" subsection to `BUILD.md` covering
     (a) per-raw invocation and (b) last-ordering-wins, with rationale.
  3. Added a multi-line comment at `src/engine/triage.ts:102` flagging
     per-raw retry semantics and referencing BUILD.md.

- [x] ### Task 5: `atomicWrite` leaks `.tmp` files on rename failure
  **Status:** ✅ Fixed
  **What was done:** Wrapped the `rename` in a try/catch that unlinks the
  `.tmp` file (best-effort) and rethrows. Added a new unit test
  `atomicWrite cleans up .tmp when rename fails` that pre-creates the
  target path as a non-empty directory so `rename(tmp, path)` fails with
  `ENOTEMPTY`/`EISDIR`, then asserts no `.tmp` files remain in `todo/`.

- [x] ### Task 6: Hoist `loadConfig` out of the cycle pop loop
  **Status:** ✅ Fixed
  **What was done:** Replaced both `cfgForTriage = await loadConfig(cwd)`
  call sites and the in-loop `await loadConfig(cwd).catch(...)` with a
  single hoisted `const cfg = args.dryRun ? null : await loadConfig(cwd)`
  near the top of the run command. Dry-run path skips the load entirely;
  the triage gate and `wfCfg` lookup both read the hoisted `cfg`.
