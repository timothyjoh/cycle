All gates green. The aggregate c8 line/branch/func figures (42.58 / 87.81 / 47.37) are the standing repo aggregate (unchanged — this cycle adds no instrumented source code); the authoritative per-file floor gate (`check:coverage`) exited 0 with all floors met.

## Summary

This cycle hardens the autonomous-delivery loop against the "passes mechanical acceptance criteria but delivers no usable value" failure mode through prompt-only changes to two engine default prompts. I modified `src/defaults/prompts/spec.md` (+33 lines: a four-part `WHY` / `CONCRETE USER BENEFIT` / `USABLE END-STATE` / `SCAFFOLDING ESCAPE HATCH` block in the SPEC.md output template, and matching `## Required Sections` prose mandating that block plus a `user-observable benefit` acceptance criterion that composes with the existing `failure-path criterion`) and `src/defaults/prompts/review.md` (+24 lines: a `Benefit delivery` verification bullet in Pass 1, an `undeliverable user benefit` entry in the NEEDS-FIX-triggers enumeration, and an `Undeliverable User Benefit` MUST-FIX task template). I ran `npm run sync-defaults` so `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their sources. I extended `tests/defaults/spec-prompt-ac.test.ts` (+5 tests: WHY, CONCRETE USER BENEFIT, USABLE END-STATE, SCAFFOLDING ESCAPE HATCH, and the user-observable-benefit/failure-path coexistence guard) and `tests/defaults/review-prompt-spec-ac.test.ts` (+1 `DOG` constant, +5 tests: Benefit-delivery bullet, undeliverable-benefit MUST-FIX routing, the NEEDS-FIX-triggers regex, the Undeliverable User Benefit template, and a new byte-identical dogfood invariant the file previously lacked).

All five PLAN.md tasks are complete (Task 1 spec edit + sync, Task 2 spec tests, Task 3 review edit + sync, Task 4 review tests + dogfood invariant, Task 5 full-suite verification). I ran `npm test` (full suite, auto-builds via `pretest`): **958 tests, 958 pass, 0 fail**. I ran `npm run test:coverage`: exit 0 with the per-file floor gate (`check:coverage`) reporting all floors met (e.g. `preflight.ts` 99.22% ≥ 95%, `run-cycle.ts` 100% ≥ 90%) and all structural invariants OK; the aggregate c8 figures (line 42.58% / branch 87.81% / func 47.37%) are the standing repo baseline and are unchanged since this cycle adds no instrumented source code — no per-file regression. `npm run typecheck` (`tsc --noEmit`) emitted no warnings. Shell-level `diff -q` on both prompt pairs exited 0, confirming the in-suite byte-identical assertions.

Failure modes handled: this is a prompt-text + test change with no live runtime code path, so per SPEC the failure guards live at the test layer — the per-mandate `body.includes(...)` / `assert.match(...)` assertions turn red if any mandate prose is removed, and the `Buffer.compare(src, dog) === 0` byte-identical dogfood tests (spec pre-existing, review newly added) fail loudly if `src/defaults/` and `.cycle/` drift. `sync-defaults` is idempotent (copy + sha-record), so an engine retry of this cycle re-runs it safely; a local-divergence destination would make it exit non-zero rather than silently overwrite. No errors are swallowed — drift or a missing mandate surfaces as a failed `node:test` assertion.

No deviations from PLAN.md. No deferred work. Per SPEC §Documentation Updates, **no CLAUDE.md / README.md change was warranted**: no CLI surface, command, or contributor-facing convention changed, and the `npm run sync-defaults` flow is already documented.

## Touched Files
- src/defaults/prompts/spec.md
- src/defaults/prompts/review.md
- .cycle/prompts/spec.md
- .cycle/prompts/review.md
- tests/defaults/spec-prompt-ac.test.ts
- tests/defaults/review-prompt-spec-ac.test.ts
