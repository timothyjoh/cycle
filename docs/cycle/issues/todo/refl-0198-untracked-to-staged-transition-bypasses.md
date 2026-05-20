---
id: refl-0198-untracked-to-staged-transition-bypasses
title: "appendDocumentationPaths: exclude pre-existing untracked files staged during doc step"
workflow: feature
depends_on: []
triaged_at: "2026-05-20T04:53:12.695Z"
source: triage
---
## Problem

`appendDocumentationPaths` in `src/engine/run-cycle.ts` builds `prePaths` from the pre-snapshot output but silently skips lines with `??` status (untracked). This creates a filter gap: if a file existed as untracked before the doc step ran and the doc step stages it (`git add`), that file appears in the post-snapshot as `A ` (added/staged) but is absent from `prePaths`. The toAppend filter only checks `prePaths`, so the file passes through and is incorrectly recorded as a doc-step artifact.

SPEC intent (cycle 0198): only paths the documentation step *itself created or modified* should be appended. A file that pre-existed the doc step — even as untracked — is not a doc-step artifact.

## Root Cause

Pre-snapshot loop (circa lines 67–78 in `appendDocumentationPaths`):

```ts
for (const line of preLines) {
  const status = line.slice(0, 2);
  if (status === '??') continue; // untracked dropped entirely — not added to prePaths
  // ... path extraction and prePaths.add() ...
}
```

The toAppend filter is `postPaths.filter(p => !prePaths.has(p))`. Because `??` paths never enter `prePaths`, a pre-existing untracked file staged during the doc step is not excluded.

## Fix

During the pre-snapshot loop, when a line has `??` status, extract its path and add it to a `preUntracked: Set<string>`. Extend the toAppend filter to also exclude paths in `preUntracked`.

Sketch (exact path extraction should use whatever inline pattern or `parsePorcelainPath` helper is present at implementation time):

```ts
const preUntracked = new Set<string>();
for (const line of preLines) {
  const status = line.slice(0, 2);
  if (status === '??') {
    preUntracked.add(/* extract path from line */);
    continue;
  }
  // existing prePaths population ...
}

// toAppend filter:
const toAppend = postPaths.filter(p => !prePaths.has(p) && !preUntracked.has(p));
```

## Acceptance Criteria

- [ ] `preUntracked` Set populated for `??` lines during the pre-snapshot loop in `appendDocumentationPaths`
- [ ] toAppend filter excludes paths present in `preUntracked`
- [ ] New unit test: pre-snapshot contains `?? untracked.md`; post-snapshot contains `A  untracked.md` (staged during doc step); `untracked.md` must **not** appear in the appended paths
- [ ] Existing tests pass with no regressions (`npm test`)
- [ ] Coverage gates pass (`npm run test:coverage && npm run check:coverage`)
- [ ] TypeScript clean (`npm run typecheck`)

## Files

- `src/engine/run-cycle.ts` — `appendDocumentationPaths` function
- `tests/run-cycle.documentation.test.ts` — new test case for the untracked-to-staged edge case

## Notes

This is independent of `refl-0198-appenddocumentationpaths-porcelain-parsi` (the `parsePorcelainPath` extraction refactor). If that refactor lands first, use `parsePorcelainPath` for path extraction in both the `preUntracked` population and the existing prePaths loop. If it has not landed, inline the same extraction pattern used by the surrounding code.

Edge case scope: this only affects doc-step bash scripts that explicitly run `git add` on pre-existing untracked files. It is uncommon but breaks the correctness guarantee of the pre/post snapshot diff introduced in cycle 0198.
