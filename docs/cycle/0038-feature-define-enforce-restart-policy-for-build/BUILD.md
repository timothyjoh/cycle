Build complete. Summary follows.

---

Modified `src/engine/branch.ts` (+33 lines): added `revParseHead`, `currentBranchName` (private), `resetCycleBranchTo` (asserts `cycle/` prefix before `git reset --hard`), and `shaExists`. Modified `src/engine/run-cycle.ts` (+44 lines): added exported `findPriorBuildHeadSha` (backward log scan for `step.start { cycle_id, step:"build" }`) and inserted build-only pre-emit logic that captures HEAD on fresh runs, hard-resets to the prior `head_sha` on resume entry, and emits `step.warning {reason: "build_pre_sha_missing" | "build_pre_sha_unreachable"}` + self-healing fresh `head_sha` when the prior SHA is absent or unreachable; gated by `!wf.no_branch`. Extended `tests/engine/branch.test.ts` (+6 tests) covering `revParseHead`, `resetCycleBranchTo` (happy path, refusal off `cycle/` branch, refusal in non-existent cwd), and `shaExists` (reachable, synthetic, non-existent cwd). Extended `tests/engine/run-cycle.test.ts` (+7 tests): three direct unit tests for `findPriorBuildHeadSha`, fresh-cycle assertion that `step.start` carries `head_sha` for `build` and not for `spec`, plus the three resume scenarios from SPEC §Acceptance (happy-path hard reset back to seeded SHA with stub-observed clean tree and self-healed `step.start`, missing-prior-SHA warning + skip-reset, unreachable-SHA warning + skip-reset). Updated `CLAUDE.md` "Resume from log tail" bullet with a `Build-step restart policy` paragraph covering capture, reset, warning paths, no_branch gate, and explicit non-policy for other agent steps; added a sub-bullet under §12 item 3 of `docs/ARCHITECTURE.md` cross-referencing CLAUDE.md.

PLAN.md tasks 1–4 all complete.

Test command: `npm test` → 311 pass, 0 fail (full pre-existing suite); `npm run test:coverage` → 316 pass, 0 fail. `npm run typecheck` clean.

Coverage (all-files vs master baseline):
- line 98.33 % (master 98.28, +0.05)
- branch 90.98 % (master 90.13, +0.85)
- func 95.71 % (master 95.36, +0.35)

Per-file (vs master baseline):
- `src/engine/branch.ts`: line 99.09 (was 98.75, +), branch 97.62 (was 91.67, +), func 93.10 (was 88.89, +) — all improved.
- `src/engine/run-cycle.ts`: line 97.78 (was 97.06, +), branch 90.91 (was 84.21, +), func 85.71 (was 83.33, +) — all improved. Remaining uncovered (lines 76, 156-158) are pre-existing trunk/no_branch finally branches unrelated to this cycle.

No deviations from PLAN.md beyond two micro-simplifications kept inside scope: (a) collapsed the original `findPriorBuildHeadSha` ENOENT/throw discrimination into a single `catch { return null }` since "no log" and "unreadable log" should both fall through to the warning + skip-reset path; (b) exported `findPriorBuildHeadSha` so its corner cases (missing log, missing field, unrelated cycles, malformed lines) are unit-tested directly rather than only via integration. No deferred work or follow-up.
