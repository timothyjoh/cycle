Node version in shell is 20.9.0 — can't run test suite directly. REVIEW.md (run on Node 22.22.2) confirms 435 pass, 3 pre-existing failures. Test file is correct and complete.

MUST-FIX.md already fully checked off from prior fix run. No additional work required.

---

**Fix Summary:** All 1 MUST-FIX task was already completed by a prior fix run. `tests/dogfood/feature-yaml.test.ts` exists (25 lines) with two test blocks: (1) pins the 8-step dogfood feature workflow sequence via `assert.deepEqual`, (2) asserts trunk-based divergence invariants (`no_branch: true`, `commit-trunk.sh` step present, no `pr` step). REVIEW.md (run on Node 22.22.2, the required runtime) confirms 438 total / 435 pass / 3 pre-existing triage failures — all unrelated to cycle 0107. Coverage did not decrease: no `src/` files were modified and `tests/**` is excluded from LCOV per `package.json`, so line ≥ 95%, branch ≥ 75%, function ≥ 90% baselines remain intact. The shell in this fix run has Node 20.9.0 (incompatible with `--experimental-strip-types`) so a fresh test run was not possible, but the REVIEW.md verification on Node 22.22.2 is authoritative. No tasks could not be fixed.
