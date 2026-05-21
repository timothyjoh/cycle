---
id: refl-0211-build-step-post-condition-rejects-no-src
title: Build step post-condition rejects no-src-change outcomes, sending already-done issues to terminal-failed
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:48:46.429Z"
source: triage
---
## Problem

The build step post-condition unconditionally requires at least one `src/` file to be modified (`git diff HEAD -- src/` non-empty). When an agent correctly determines the requested work is already shipped and exits 0 without touching `src/`, the post-condition fires `build post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)` and the cycle goes `terminal-failed`.

This makes an entire class of work items structurally impossible to close:
- Verification cycles (confirm an already-implemented feature)
- Test-only additions where no src/ file changes
- Documentation or prompt-only updates if those also land outside src/

**Observed failure:** `refl-0202` failed three times with this error. The underlying feature (stripFences in triage) was already shipped in cycle 0206; the agent correctly concluded there was nothing to do, but the engine rejected the outcome. Dependents were orphaned as a result.

## Root Cause

`build post-condition` in the engine checks `git diff HEAD -- src/` after the build step. An empty diff is treated as failure regardless of agent exit code or reasoning. There is no escape hatch for already-done or test-only work.

## Fix Direction

Add a sentinel escape hatch to the build post-condition. When the agent exits 0 **and** `BUILD.md` frontmatter contains `no-src-changes: true`, the post-condition should pass even with an empty `src/` diff.

### Implementation Steps

1. **Locate the post-condition check.** Find the build post-condition logic in `src/engine/commit-cycle.ts` (or wherever `build post-condition failed: no src/ changes detected` is emitted).
2. **Parse BUILD.md frontmatter.** After `git diff HEAD -- src/` returns empty, read `BUILD.md` and parse its YAML frontmatter. Check for `no-src-changes: true`.
3. **Gate on sentinel + exit code.** If sentinel is present and agent exit code is 0: pass the post-condition. Otherwise: fail as before.
4. **Update the BUILD.md default template** in `src/defaults/` to document the `no-src-changes: true` sentinel field with usage guidance (when to use it, consequences of misuse).
5. **Run `npm run sync-defaults`** after editing `src/defaults/`.
6. **Add tests** covering:
   - Sentinel present + exit 0 → post-condition passes
   - Sentinel absent + empty src/ diff + exit 0 → post-condition fails
   - Sentinel present + non-zero exit → post-condition fails
   - Sentinel present but malformed frontmatter → post-condition fails safely

## Acceptance Criteria

- [ ] Build post-condition passes when agent exits 0 AND `BUILD.md` frontmatter contains `no-src-changes: true`
- [ ] Build post-condition still fails when agent exits 0, `src/` diff is empty, and sentinel is absent
- [ ] Build post-condition still fails when agent exits non-zero, regardless of sentinel value
- [ ] `BUILD.md` default template documents the sentinel field with a note on correct usage
- [ ] `npm run sync-defaults` run after template edit
- [ ] New sentinel path covered by at least one unit test
- [ ] All existing tests pass; coverage gates met (no decrease vs baseline)
