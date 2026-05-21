I have everything needed. Writing the research document now.

`★ Insight ─────────────────────────────────────`
Key finding before writing: `engine-lock.ts` (100%) is **already present** in CLAUDE.md line 37 — added during cycle 0203's doc step (obs 2767). Additionally, `coverage-gate.mjs` has two entries (`scripts/structural-invariants.mjs` 90%, `src/engine/exec-spawn.ts` 90%) absent from CLAUDE.md. The planner must confront: the primary SPEC change is already done.
`─────────────────────────────────────────────────`

```markdown
# Research: Cycle 0204

## Cycle Context
SPEC asks for a single documentation change: add `src/engine/engine-lock.ts` (100%) to the
per-file floors list in the Coverage policy section of `CLAUDE.md` (line 37), matching the
format of adjacent entries like `src/engine/path-utils.ts` (100%). The entry was added to
`scripts/coverage-gate.mjs` during cycle 0202 but the CLAUDE.md prose was not updated at
that time. No code logic is affected; `npm test` must pass.

## Current Codebase State

### Relevant Components

- **CLAUDE.md Coverage policy section**: The per-file floors bullet is a single long line at
  `CLAUDE.md:37`. **As of the working tree today, `src/engine/engine-lock.ts` (100%) is
  already present in that list**, between `src/engine/path-utils.ts` (100%) and
  `src/engine/child-env.ts` (100%). This entry was added during cycle 0203's documentation
  step (observation 2767, 1:04a May 21). The primary SPEC change is already applied.

- **`scripts/coverage-gate.mjs` FLOORS table** (`scripts/coverage-gate.mjs:12-26`): The
  authoritative list of per-file floors enforced at test time. Contains 13 entries. Three
  entries are absent from CLAUDE.md's prose list:
  - `scripts/structural-invariants.mjs`: 90 — not in CLAUDE.md
  - `src/engine/exec-spawn.ts`: 90 — not in CLAUDE.md
  - `src/engine/engine-lock.ts`: 100 — **IS in CLAUDE.md** (already present)

- **CLAUDE.md Coverage policy list (full, current)** (`CLAUDE.md:37`):
  `src/engine/triage.ts` (95%), `src/engine/issue-lifecycle.ts` (95%),
  `src/engine/commit-cycle.ts` (95%), `src/engine/branch.ts` (90%),
  `src/engine/stale-dist.ts` (95%), `src/cli/run-one.ts` (70%),
  `scripts/sync-defaults.mjs` (90%), `src/cli/cleanup.ts` (70%),
  `src/engine/path-utils.ts` (100%), **`src/engine/engine-lock.ts` (100%)**,
  `src/engine/child-env.ts` (100%).

### Existing Patterns to Follow

- **Per-file floor entry format** (`CLAUDE.md:37`): backtick-wrapped path followed by
  parenthesized percentage, comma-separated inline in a single bullet. Example:
  `` `src/engine/path-utils.ts` (100%) ``.
- **Coverage gate enforcement**: `scripts/coverage-gate.mjs` is the machine-enforced source
  of truth; CLAUDE.md prose is the human-readable companion. The script comment at line 8
  says "Keep aggregate thresholds in CLAUDE.md; this script is for surgical per-file gates."

### Dependencies & Integration Points

- `scripts/coverage-gate.mjs` — the only file that enforces per-file floors at CI time.
  CLAUDE.md does not reference this script programmatically; it is documentation only.
- `npm run check:coverage` invokes `coverage-gate.mjs` automatically after `test:coverage`
  (`CLAUDE.md:24`). No CLAUDE.md change affects this pipeline.

### Test Infrastructure

- **Test framework**: Node built-in test runner (`node --test`), no transpile step.
- **Coverage**: `npm run test:coverage` → `npm run check:coverage` → `scripts/coverage-gate.mjs`.
- **No tests cover CLAUDE.md content**: this is a documentation-only file. `npm test` passes
  regardless of CLAUDE.md prose content; the acceptance criterion "npm test passes" is a
  regression guard, not a functional test of this change.
- **Current coverage of change area**: N/A — CLAUDE.md is not instrumented.

## Code References

- `CLAUDE.md:33-37` — Coverage policy section; per-file floors bullet is line 37.
- `CLAUDE.md:37` — Current list already includes `src/engine/engine-lock.ts` (100%).
- `scripts/coverage-gate.mjs:12-26` — FLOORS table; 13 entries including `engine-lock.ts`
  (line 24), `structural-invariants.mjs` (line 20), `exec-spawn.ts` (line 22).
- `scripts/coverage-gate.mjs:8` — Comment directing contributors to keep aggregate
  thresholds in CLAUDE.md; per-file gates live in the script.

## Open Questions

1. **Primary change already applied**: The target entry (`src/engine/engine-lock.ts` 100%)
   is already in CLAUDE.md as of the working tree. The planner must decide: (a) treat the
   cycle as complete and proceed directly to verify/commit, or (b) determine whether the
   working-tree state is uncommitted and needs a commit, or already committed.

2. **Two coverage-gate.mjs entries absent from CLAUDE.md**: `scripts/structural-invariants.mjs`
   (90%) and `src/engine/exec-spawn.ts` (90%) exist in the FLOORS table but are not listed
   in CLAUDE.md. The SPEC explicitly scopes this cycle to engine-lock.ts only and forbids
   other changes; the planner must decide whether to note these as out-of-scope or file
   follow-up issues.

3. **Committed vs. uncommitted**: Git status at session start does not show CLAUDE.md as
   modified (it is not in the tracked-changed or untracked file lists), implying the
   engine-lock.ts addition is already committed (likely as part of the cycle 0203 commit).
   The planner should verify via `git log CLAUDE.md` before drafting build steps.
```
