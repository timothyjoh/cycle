# Research: Cycle 0108

## Cycle Context

Cycle 0108 is a verification-and-documentation cycle with no src/ code changes. It must inspect `src/engine/run-cycle.ts` and `.cycle/scripts/commit-trunk.sh` to determine whether two guards are actually present in source: (1) an empty-diff post-condition guard on build/fix steps, and (2) an artifact-only commit guard (exit non-zero when staged files contain no `src/` changes). If either guard is absent, a new `docs/cycle/issues/todo/` issue must be created. The source issue is then moved from `todo/` to `done/`.

## Current Codebase State

### Relevant Components

- **`src/engine/run-cycle.ts`** — main cycle runner, 264 lines. Executes workflow steps in sequence, handles artifact writing, spec-byte-floor guard, reflection ingest, and step failure routing. — `src/engine/run-cycle.ts:1`

- **`.cycle/scripts/commit-trunk.sh`** — trunk-workflow commit script, 88 lines. Stages files via `git status --porcelain`, skips denied/gitlink paths, exits 0 if nothing cached, then commits and pushes. — `.cycle/scripts/commit-trunk.sh:1`

- **`.cycle/scripts/commit-trunk.sh.bak`** — present in working tree (`?? .cycle/scripts/commit-trunk.sh.bak`), not committed. Likely a leftover from prior editing attempt.

- **Source issue** — `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` — confirmed present and readable.

### Guard Verification Findings

#### Empty-diff post-condition guard — `src/engine/run-cycle.ts`

**ABSENT.** Scanning all 264 lines of `run-cycle.ts`:
- The only step-name special-casing is a spec-byte-floor guard (lines 198–204), a reflection ingest (lines 207–209), and a `documentation` soft-fail (lines 225–228).
- No `git diff` invocation, no check for whether build/fix produced any src/ changes, no post-condition that exits non-zero on zero-diff outcomes.
- `RESET_ELIGIBLE_STEPS` at line 23 marks `build` and `fix` as reset-eligible (branch reset on retry), but there is no diff guard paired with this.

Related issue in `failed/`: `refl-0078-build-and-fix-steps-silently-succeed-whe.md` — the original ticket for this guard has `failed` status, confirming the guard was never shipped.

#### Artifact-only commit guard — `.cycle/scripts/commit-trunk.sh`

**ABSENT.** The file has one early-exit check (lines 62–65):
```bash
if git diff --cached --quiet; then
  echo "commit-trunk.sh: nothing to commit"
  exit 0
fi
```
This exits `0` (success) when nothing is staged — it does **not** check whether staged files include any `src/` paths. No `src/`-filter, no `git diff --cached --name-only | grep "^src/"` check, no non-zero exit for artifact-only commits.

Related issue in `failed/`: `refl-0083-commit-trunk-sh-commits-artifact-only-ch.md` — confirms the guard failed to ship.

Cycle 0100 commit message claims "Block commit-trunk.sh commits when diff contains no src/ changes (artifact-only guard)" but the file content does not contain this guard — consistent with observation 1170 ("Artifact-only guard feature claimed but not implemented").

### Existing Patterns to Follow

- **Issue file format**: YAML frontmatter with `id`, `title`, `workflow`, `depends_on`, `triaged_at`, `source`, `parent` fields, followed by `## Context` and `## Resolution` or `## Acceptance Criteria` sections. — `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md:1`

- **Spec-guard precedent**: Special-casing a step by name (`step.name === "spec"`) inside the artifact-write seam is the established pattern for adding post-conditions in `run-cycle.ts`. — `src/engine/run-cycle.ts:198–204`

- **Issue move to done/**: Move file from `docs/cycle/issues/todo/` to `docs/cycle/issues/done/`. No rename, same filename. — `docs/cycle/issues/done/` (multiple examples in repo).

- **Nothing-to-commit exit 0**: Both `commit.sh` and `commit-trunk.sh` exit 0 on empty cache (not non-zero). Any new artifact-only guard would change this to exit non-zero for the src/-absent case. — `.cycle/scripts/commit-trunk.sh:62–65`, `.cycle/scripts/commit.sh:similar`

### Dependencies & Integration Points

- `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` — source issue to move; confirmed present.
- `docs/cycle/issues/done/` — destination directory for the moved issue; directory exists.
- `docs/cycle/issues/todo/` — location for any new missing-guard issue.
- `npm test` — must pass after the file move (only file operation, no src/ changes).

### Test Infrastructure

- Test framework: Node.js built-in `node:test` with `node:assert`.
- Test directories: `tests/engine/`, `tests/cli/`, `tests/defaults/`, `tests/dogfood/`, `tests/issue/`.
- No tests exist for the empty-diff post-condition guard in `run-cycle.ts`.
- No tests exist for the artifact-only guard in `commit-trunk.sh` (only test referencing commit-trunk.sh is `tests/dogfood/feature-yaml.test.ts:20–21`, which just asserts the workflow YAML references the script).
- Current test count: 434 tests (observation 1139).

## Code References

- `src/engine/run-cycle.ts:23` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` — marks which steps can be branch-reset; no diff guard companion.
- `src/engine/run-cycle.ts:46` — `SPEC_MIN_BYTES = 200` — only existing byte-floor post-condition guard.
- `src/engine/run-cycle.ts:198–204` — spec-byte-floor guard insertion point; the precedent for step-name-specific post-conditions.
- `src/engine/run-cycle.ts:207–209` — reflection ingest guard; second example of step-name branching.
- `.cycle/scripts/commit-trunk.sh:62–65` — `exit 0` on empty staged index; no src/-filter guard present.
- `.cycle/scripts/commit-trunk.sh.bak` — untracked backup file in working tree.
- `docs/cycle/issues/failed/refl-0078-build-and-fix-steps-silently-succeed-whe.md` — confirms empty-diff guard never shipped.
- `docs/cycle/issues/failed/refl-0083-commit-trunk-sh-commits-artifact-only-ch.md` — confirms artifact-only guard never shipped.
- `docs/cycle/issues/todo/refl-0079-depends-on-refl-0078-empty-diff-guard-bl-ordering-priority-note.md` — traceability issue blocked on both guards landing; still in `todo/`.

## Open Questions

- Should the new todo issues created for the two missing guards use `parent` IDs derived from the failed issues (`refl-0078-*` and `refl-0083-*`) or stand alone? The issue format supports `parent:` but it is optional.
- The `.cycle/scripts/commit-trunk.sh.bak` file is untracked. Should the planner include cleanup of this file in the cycle scope, or treat it as out of scope per the SPEC ("Out of Scope: Modifying any src/ engine code")?
- The SPEC says "If either guard is absent: create a new `todo/` issue." Both are absent — should this result in one combined issue or two separate issues (one per guard)?
