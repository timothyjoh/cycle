reason: already-satisfied

# No-op: cycle 0048 deliverables already committed

The two integration cases this SPEC requires already exist in the committed
test file (landed by commit `8610b73 chore: land cycle 0046-0048 residue …`),
so no code change is warranted. Re-implementing them would fabricate a diff for
already-satisfied acceptance criteria.

## Evidence

- AC1 / AC3 — positive case whose sole doc deliverable is a brand-new untracked
  subdirectory (`docs/adr/0001.md`), asserting `ok` with zero `cycle.noop`:
  `tests/engine/empty-diff-guard.test.ts:328`
- The positive case's `r.status === "ok"` and zero-`cycle.noop` assertions:
  `tests/engine/empty-diff-guard.test.ts:348`
- AC4 — discriminating lock case (untracked subtree with no in-scope deliverable
  → `failed`) that flips when the flag is removed:
  `tests/engine/empty-diff-guard.test.ts:377`
- The lock case's `failed` + `build post-condition failed` assertions:
  `tests/engine/empty-diff-guard.test.ts:403`
- The production flag under test (`--untracked-files=all` doc-deliverable scan)
  remains present and unchanged: `src/engine/run-cycle.ts:810`
