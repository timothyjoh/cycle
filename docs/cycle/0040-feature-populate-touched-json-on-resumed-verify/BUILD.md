## Summary

Reconstructed `touched.json` on the resume / verify-only path so the cycle footprint record (consumed by `commitCycle` for `commit.scope_warning`) stays meaningful when the build step does not re-execute in the current process. Modified `src/engine/run-cycle.ts` (+88 net lines): (1) extracted the inline `## Touched Files` parser into a new exported pure helper `parseTouchedFilesSection(text): Set<string>` and repointed `appendDocumentationPaths` at it (behavior preserved — `headerIdx` is still computed locally for the insertion logic, and the absent-header early return is now `if (touchedSet.size === 0) return`); (2) added the exported best-effort `recoverTouchedFiles(repoRoot, artifactDir, log, cycleId)` after `accumulateTouchedFiles` — it skips when `touched.json` is already populated (silent no-op), reads `BUILD.md`'s declared footprint, unions it with current in-scope `git status --porcelain` paths, `isDenied`-filters both, writes the unchanged sorted/deduped `{ files }` schema, and emits `touched.recovered { cycle_id, source: "BUILD.md", count }` on success / `engine.warning { reason: "touched_recovery_empty" }` when nothing is recoverable / `engine.warning { reason: "touched_recovery_write_failed" }` on a write error; (3) wired it into `runCycle` once before the step loop, gated on `opts.resume && maxResetIdx >= 0 && startIdx > maxResetIdx`, wrapped in a best-effort `try/catch`. Added `tests/engine/run-cycle.touched-recovery.test.ts` (366 lines). Updated `docs/ENGINE.md` (*touched.json footprint*) and `CLAUDE.md` (new `run-cycle.ts` footprint note). README needs no change (no user-facing CLI surface change). This completes PLAN tasks 1–5.

**Tests:** `npm test` → 1066 pass, 0 fail. `npm run typecheck` clean. `npm run check:coverage` → exit 0; `npm run check:invariants` → exit 0.

**Coverage** (`npm run test:coverage`): `src/engine/run-cycle.ts` — Line 100.00% (915/915), Branch 97.47% (270/277), Func 96.30% (26/27), all comfortably above the 90% per-file floor; no per-file regressions (gate exit 0).

**Failure modes handled & their tests:** missing/unreadable `BUILD.md` and absent `## Touched Files` header both degrade to an empty declared set → `touched_recovery_empty` warning, file untouched (two no-`BUILD.md`/no-header tests); non-zero `git status --porcelain` contributes an empty current set but does **not** abort, so a recoverable `BUILD.md` still populates the file (non-repo cwd test); write failure (forced via a directory at the `touched.json` path — reliable even as root, since perms-based `chmod 0o555` is bypassed by root) → `touched_recovery_write_failed` warning, no throw; already-populated `touched.json` → idempotent event-less no-op, no clobber; `isDenied` exclusion verified with a `dist/` path; plus the `runCycle` resume-wiring integration test (`expectExactlyOne touched.recovered`) and the normal-path regression test (zero `touched.recovered`). Every degrade emits exactly one observable event — no silently swallowed error; the only event-less exit is the deliberate populated-guard no-op.

**Deviations from PLAN.md:** the write-failure test uses a directory-at-target (EISDIR) instead of the PLAN's suggested `chmod 0o555`, because the build runs as root where chmod-based read-only dirs are bypassed; and the `isDenied` test uses `dist/bundle.js` rather than `.cycle/log.jsonl` (the latter is not in the `isDenied` denylist — only `.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock` are). Both adapt to the same SPEC requirement without changing scope.

**Deferred / follow-up:** none beyond the SPEC's explicitly out-of-scope base-branch `git diff` recovery.

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.touched-recovery.test.ts
- docs/ENGINE.md
- CLAUDE.md
- docs/ARCHITECTURE.md
