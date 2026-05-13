Build complete. Summary follows.

# BUILD Summary — Cycle 0005

## Files modified / created
- `src/defaults/scripts/commit.sh` (rewrite, 16 → 62 lines): replaced `git add -A` with selective-staging loop driven by `git status --porcelain --untracked-files=all`, denylist (`.claude/**`, `dist/**`, `node_modules/**`, `*.lock`, `.cycle/cycle.pid`), and gitlink detection (mode 160000 via `git ls-files --stage` + fs probe for `$path/.git`). Residuals emit `commit.sh: unstaged residual: <path>` to stderr; denylisted entries already in the index are defensively unstaged via `git reset -q HEAD -- "$path"`. Preserves `nothing to commit` exit-0 and trailing `git rev-parse HEAD`.
- `.cycle/scripts/commit.sh` (auto, 62 lines): synced byte-for-byte from `src/defaults/scripts/commit.sh` via `npm run sync-defaults`.
- `tests/defaults/commit-staging.test.ts` (new, 190 lines): 6 behavioral tests over tmpdir git fixtures — happy path, transient rejection (incl. mode 160000 cacheinfo gitlink), node_modules + arbitrary `.lock`, nothing-to-commit with only transients, triaged issue file location, and source-level `git add -A` regression guard.
- `docs/DOGFOOD.md` (one line appended after line 77): `**Resolved in cycle 0005 (GH #4).**`

## PLAN tasks complete
Task 1 (test suite — red phase initially confirmed: 4/6 new tests failed against the original `git add -A`), Task 2 (script rewrite — green phase), Task 3 (sync, DOGFOOD annotation, gate run) — all complete.

## Test run
`npm test` — `node --test --experimental-strip-types --test-reporter=spec` → 43 pass, 0 fail, 0 skipped, ~2.6 s. Includes the 6 new tests under `tests/defaults/commit-staging.test.ts` and the prior `tests/defaults/scripts.test.ts` regression (`commit.sh has shebang and is executable`).

## Deviations from PLAN
1. **`git status --porcelain --untracked-files=all`** instead of bare `--porcelain`. The default `normal` untracked mode collapses directories (`?? .claude/`), which would have produced a single coarse residual line and broken per-file SPEC assertions. `-uall` enumerates each file and is required to satisfy the SPEC's "each residual path on its own line" guarantee.
2. **Defensive `git reset -q HEAD -- "$path"`** added for denylist/gitlink matches. Necessary because already-indexed denylisted entries (e.g. a 160000 cacheinfo or a stray `git add` from upstream steps) would otherwise survive the staging pass and end up in the commit. Implements the SPEC's "MUST treat … never stage them, even if they match the allowlist by accident."
3. **Test fixture seeds a `.gitignore` containing `.cycle/`** so the test's own fixture scaffolding (`.cycle/log.jsonl`, `.cycle/scripts/commit.sh`) doesn't pollute `git status` output — mirrors the real-repo `.gitignore` setup.
4. **Issue-file resolution simplified** per the PLAN's own resolution of RESEARCH open questions: porcelain naturally enumerates the issue file as an untracked addition, so no explicit `.cycle/log.jsonl` parse is needed. The `.cycle/log.jsonl` is still produced by the engine and remains available for diagnostic use.

## Known follow-ups (not in this cycle)
- `npm run typecheck` reports two **pre-existing** errors in `tests/cli/multi-loop.test.ts` (TS2550 on `Array.findLast` — `lib` target needs `es2023`). Unrelated to this cycle; flagged for a separate fix.
- `dist/defaults/scripts/commit.sh` is the build-output copy and was intentionally NOT edited (out of SPEC); `scripts/build.mjs` will regenerate it from `src/defaults/` on next build.
