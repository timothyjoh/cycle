All gates pass. Both tasks complete.

## Summary

Modified `src/defaults/prompts/spec.md` line 131: replaced `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` with `docs/cycle/NNNN-feature-<title>/SPEC.md`. Ran `npm run sync-defaults` to propagate the change to `.cycle/prompts/spec.md`. Both files verified by grep — hardcoded path absent, placeholder present.

**Test suite**: `npm test` — 659/659 pass, 0 failures.

**Typecheck**: `npm run typecheck` — no warnings.

**Coverage**: `npm run test:coverage && npm run check:coverage` — Line 98.53%, Branch 92.53%, Function 92.95%. All per-file floors pass. No regression vs baseline.

**PLAN.md tasks**: Task 1 (replace hardcoded path in source) ✅, Task 2 (sync + verify) ✅.

No deviations from PLAN.md. `npm run sync-defaults` exited 2 due to 2 locally-divergent skips (reflection.md, verify.sh) — expected behavior; spec.md synced correctly as confirmed by grep.

## Touched Files
- src/defaults/prompts/spec.md
- .cycle/prompts/spec.md
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0222-gemini-auggie-pi-appendsystemprompt-find.md
- docs/cycle/issues/todo/refl-0218-argv-order-for-append-system-prompt-unas.md
- docs/cycle/issues/todo/refl-0218-non-claudecode-exec-modules-silently-ign-generic-forwarding.md
- tests/engine/exec-claudecode.test.ts
