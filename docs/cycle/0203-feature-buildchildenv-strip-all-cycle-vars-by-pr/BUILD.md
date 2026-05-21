Clean. All gates pass.

---

Implemented cycle 0203 across 4 files. Replaced the per-name `CYCLE_TRUNK_BASED` destructure in `buildChildEnv` with a prefix filter (`Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CYCLE_")))`). Added two new unit tests covering (a) all `CYCLE_*` vars stripped from base env and (b) explicit `extra` entries override the strip. Added `"src/engine/child-env.ts": 100` floor to `scripts/coverage-gate.mjs` and updated the synthetic LCOV fixtures in `tests/scripts/coverage-gate.test.ts` to include the new entry. Updated `CLAUDE.md` per-file floors list. Full suite: **578 tests, 0 failures**. Coverage: Line 98.51%, Branch 92.47%, Function 92.92% — all gates pass. `child-env.ts` at 100% ≥ 100% floor. No deviations from PLAN.md. No follow-up work.

## Touched Files
- src/engine/child-env.ts
- tests/engine/child-env.test.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0202-buildchildenv-strips-cycle-trunk-based-b.md
- docs/cycle/issues/raw/refl-0202-claude-md-per-file-floors-list-missing-e.md
- docs/cycle/issues/raw/refl-0202-triage-agent-emits-markdown-fenced-json.md
- docs/cycle/issues/todo/redesign-01-single-engine-lock.md
