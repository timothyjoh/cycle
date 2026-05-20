Clean. All tasks complete.

---

Modified `src/defaults/workflows.yml` (swapped lines 27–28: reflection now at index 7, documentation at index 8) and ran `npm run sync-defaults` to propagate to `.cycle/workflows.yml` (synced; 2 divergent-skip exit code is expected for `reflection.md` and `verify.sh`). Updated step-order assertions in `tests/defaults/feature-yaml.test.ts:11`, `tests/dogfood/feature-yaml.test.ts:13`, and `tests/defaults/feature-loadable.test.ts:17–20`. Updated both occurrences in `docs/ARCHITECTURE.md` (lines 496 and 663) from `documentation → reflection` to `reflection → documentation`. Ran `npm test` — 531 pass, 0 fail. Ran `npm run test:coverage` — Line 98.54%, Branch 91.69%, Function 93.18%; all per-file coverage floors met; no regressions.

## Touched Files
- src/defaults/workflows.yml
- .cycle/workflows.yml
- tests/defaults/feature-yaml.test.ts
- tests/dogfood/feature-yaml.test.ts
- tests/defaults/feature-loadable.test.ts
- docs/ARCHITECTURE.md
- README.md
- docs/cycle/issues/raw/refl-0189-engine-stop-emits-no-reason-field-when-h.md
- docs/cycle/issues/raw/refl-0189-scope-guard-counter-logic-duplicated-in.md
- docs/cycle/issues/raw/refl-0189-scopeguard-enforces-only-src-and-scripts.md
- docs/cycle/issues/todo/refl-0187-engine-retries-cycle-on-deterministic-co.md
