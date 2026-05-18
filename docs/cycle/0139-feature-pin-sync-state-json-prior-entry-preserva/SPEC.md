# SPEC — Cycle 0139: Pin `.sync-state.json` Prior-Entry Preservation Across Skipped Divergent Paths

## Objective
Add a regression-pin test that verifies skipped (divergent) paths leave any pre-existing `.sync-state.json` entry byte-identical after a `sync-defaults` run. The current test `state recording omits skipped paths` only covers the empty-starting-state case, which cannot distinguish "entry preserved" from "entry never written." This cycle closes that gap with a seeded-state fixture, preventing silent regressions where a refactor clears state on skip.

## Source Issue
`refl-0048-sync-state-prior-entry-preservation-acro` — "Pin `.sync-state.json` prior-entry preservation across skipped divergent paths"

## Scope

### In Scope
- Add one new test in `tests/defaults/sync-defaults-guard.test.ts` that seeds `.cycle/.sync-state.json` with a prior entry for a divergent path, runs the script, and asserts the entry is byte-identical after the run.
- The seeded state should also include a non-divergent path entry to confirm non-divergent entries survive untouched.

### Out of Scope
- Production code changes to `scripts/sync-defaults.mjs`.
- Resolving PLAN-vs-impl drift on the conditional state write (that is `refl-0048-plan-vs-impl-drift-on-conditional-state`, a dependency already resolved).
- Coverage instrumentation for `scripts/**` (separate issue).

## Requirements
- The new test must seed `.cycle/.sync-state.json` before the script runs, with a placeholder entry whose `src_sha256` and `dst_sha256` are known synthetic values.
- After the run the parsed state for the divergent key must deep-equal the seeded entry.
- After the run a non-divergent key seeded alongside must also be untouched (same values as seeded).
- Exit code must be `2` (skip path triggered).
- No production code changes.

## Acceptance Criteria
- [ ] New test seeds `.cycle/.sync-state.json` with a prior entry for `.cycle/workflows.yml` (divergent path) and a prior entry for a second non-divergent path.
- [ ] After `runScript`, exit code is `2`.
- [ ] The divergent path's entry in `.cycle/.sync-state.json` is deep-equal (all fields: `src_sha256`, `dst_sha256`, `synced_at`) to the seeded value — the script did not overwrite or delete it.
- [ ] The non-divergent path's entry also survives with its seeded values preserved (or is replaced by correct freshly-written values that match the source — either assertion is valid; the key invariant is the divergent entry).
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Framework: Node built-in `node:test` + `node:assert` (matches existing file conventions).
- Add one new `test(...)` block after the existing `state recording omits skipped paths` test (line 151–174).
- Use the existing `seed()` helper to lay down source and destination files; write `.cycle/.sync-state.json` directly with `writeFile` before calling `runScript`.
- Seed shape: `{ ".cycle/workflows.yml": { src_sha256: "deadbeef…64chars…", dst_sha256: "cafebabe…64chars…", synced_at: "2026-01-01T00:00:00.000Z" }, ".cycle/prompts/spec.md": { src_sha256: "aabb…", dst_sha256: "aabb…", synced_at: "…" } }` — workflows.yml diverged, spec.md non-divergent.
- Assert with `assert.deepEqual` on the parsed divergent entry.
- ~10–15 added lines total.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — no new commands or conventions.
- **README.md**: No changes — internal test coverage, no user-visible behavior.

## Dependencies
- `refl-0048-plan-vs-impl-drift-on-conditional-state` resolved (already done — the conditional write contract is settled, this test pins it).
- `tests/defaults/sync-defaults-guard.test.ts` and its `seed`/`runScript` helpers must exist (they do).
