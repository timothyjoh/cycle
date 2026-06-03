# Final Fixes — Cycle 0035

> Footprint: .cycle/prompts/research.md, CLAUDE.md, docs/ENGINE.md, src/defaults/prompts/research.md, src/engine/run-cycle.ts, tests/cli/noop-drain.test.ts, tests/engine/noop-resolution.test.ts

## Fix 1: research prompt says no-op fires before spec but spec runs first

`src/defaults/prompts/research.md:55` (and the synced `.cycle/prompts/research.md:55`) tells the agent the no-op marker lets the engine "resolve the cycle before spec/plan/build/review" agents run. But in the `feature` workflow `spec` runs *before* `research` (`workflows.yml:31→32`), so `spec` has already executed by the time the research short-circuit fires — the saved steps are `plan`/`build`/`review`/`fix`. REVIEW.md Finding 2 flagged this exact wording as loose-but-non-blocking and worth a one-word tightening.

Mechanical correction in a file already edited this cycle: drop `spec/` from the phrase so it reads "before plan/build/review". Both the `src/defaults/` source and the `.cycle/` synced copy need the edit (or edit the source and re-run `npm run sync-defaults`).
