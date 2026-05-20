---
id: refl-0198-appenddocumentationpaths-porcelain-parsi
title: Extract parsePorcelainPath helper to eliminate duplication in appendDocumentationPaths
workflow: feature
depends_on: []
triaged_at: "2026-05-20T04:50:49.190Z"
source: triage
---
## Goal

Extract a `parsePorcelainPath(raw: string): string | null` helper in `src/engine/run-cycle.ts` so both the pre-snapshot loop and the post-snapshot loop in `appendDocumentationPaths` share a single porcelain-parsing implementation.

## Background

`appendDocumentationPaths` (introduced in cycle 0198) captures `git status --porcelain` output at two points:

- **pre-snapshot loop** (lines ~67–78): builds the `prePaths` set before the doc step runs
- **post-snapshot loop** (lines ~88–98): builds the `toAppend` list after the doc step runs

Both loops contain identical inline logic:

1. Skip untracked lines (`??` prefix)
2. For R/C (rename/copy) lines, split on `->` and take the right-hand side
3. Strip surrounding quotes if present
4. Strip the leading 3-char status prefix for plain staged/modified lines

This duplication means any change to porcelain format handling (e.g. space-in-filename edge cases, `--porcelain=v2` migration) must be applied in two places. The `spawnSync` call between the loops makes it easy to miss the second site.

This matches the extraction pattern already established by `truncateHeadCapped` in `src/engine/log-fmt.ts`.

## Acceptance criteria

- [ ] `parsePorcelainPath(raw: string): string | null` extracted within `src/engine/run-cycle.ts`
- [ ] Returns `null` for `??`-prefixed untracked lines; callers filter out nulls
- [ ] Handles R/C rename lines: splits on ` -> `, trims, strips quotes from the destination path
- [ ] Handles plain staged/modified lines: strips 3-char status prefix, strips quotes
- [ ] Both loops in `appendDocumentationPaths` refactored to call `parsePorcelainPath`
- [ ] New unit tests cover: untracked line → null, plain unquoted path, plain quoted path, rename line unquoted, rename line quoted
- [ ] All 559 existing tests continue to pass (no behavior change)
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run test:coverage && npm run check:coverage` passes all gates

## Notes

- Pure refactor — observable behavior must not change
- Keep the helper unexported unless another module requires it
- Priority hint: 6 (low; risk is maintenance-only, not correctness)
- Origin cycle: 0198
