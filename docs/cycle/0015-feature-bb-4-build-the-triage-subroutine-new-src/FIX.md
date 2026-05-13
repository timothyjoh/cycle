## Fix Cycle Summary

Addressed all 6 MUST-FIX tasks for cycle 0015 (BB-4 triage subroutine).

**Tasks completed:**
- **Task 1** (Critical): `tests/cli/triage.test.ts` now reconstructs queue state from `cycle.start` events and asserts exact ordering `[aId, bId]`.
- **Task 2** (Critical): Integration test binds `spawnSync` result and asserts `run.status === 0` with stdout+stderr captured for failure diagnostics.
- **Task 3** (Critical): Test now asserts each child id appears exactly once across `todo/`+`done/` and parses the frontmatter (`fm.id`, `fm.parent`, `fm.workflow`, `fm.depends_on`, `fm.triaged_at`, `fm.source === "triage"`).
- **Task 4** (Minor): `CLAUDE.md:38` clause added, "Deviations from SPEC" section prepended to `BUILD.md`, multi-line comment at `src/engine/triage.ts:106` explaining per-raw retry semantics.
- **Task 5** (Minor): `atomicWrite` wraps `rename` in try/catch with best-effort `unlink(tmp)`; new test `atomicWrite cleans up .tmp when rename fails` exercises the path via a pre-existing target directory.
- **Task 6** (Minor): Single hoisted `const cfg = args.dryRun ? null : await loadConfig(cwd)`; both triage sites and the `wfCfg` lookup read it.

**Test outcome:** `npm test` → 169 passed / 0 failed (was 168 before; +1 from new atomicWrite leak test).

**Coverage** (`npm run test:coverage`):
- all-files: line **96.13%** / branch **88.30%** / func **95.05%**
- triage.ts: line **93.20%** / branch **91.97%** / func **96.77%**
- BUILD.md baseline: line 96.25 / branch 88.32 / func 94.06.
- Line and branch dipped ~0.12pt and ~0.02pt within noise (new defensive `unlink` catch in `atomicWrite` introduces an uncovered fallback); function rose +0.99pt. All three remain above policy thresholds (≥95 / ≥75 / ≥90).

No tasks deferred or failed.
