# Research: Cycle 0109

## Cycle Context

Cycle 0109 must verify whether the `reflection` step precedes `commit` in both `src/defaults/workflows.yml` and `.cycle/workflows.yml` (feature workflow), then either write a one-sentence note to `DOCUMENTATION.md` (if both checks pass) or create a new `docs/cycle/issues/todo/` file and move the source issue to `failed/` (if either check fails).

## Current Codebase State

### Relevant Components

- **`src/defaults/workflows.yml`** — canonical workflow definition for downstream consumers. Feature workflow currently has 10 steps; `reflection` is **absent** (removed by commit `41d5f26`). Step order: `spec, research, plan, build, review, fix, verify, commit, pr, documentation`. — `src/defaults/workflows.yml:14-24`

- **`.cycle/workflows.yml`** — dogfood (local) workflow definition. Feature workflow currently has 8 steps; `reflection` is **absent** (also removed by `41d5f26`). Step order: `spec, research, plan, build, review, fix, verify, commit`. Has LOCAL DIVERGENCE block: `no_branch: true`, no `pr` step, uses `commit-trunk.sh`. — `.cycle/workflows.yml:17-29`

- **`docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md`** — source issue for this cycle. Depends on `refl-0078-cycle-0078-fix-never-applied-reflection`. — `docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md:5`

- **`docs/cycle/issues/done/refl-0078-cycle-0078-fix-never-applied-reflection.md`** — dependency issue; confirmed present in `done/`. That issue's acceptance criteria required `reflection` before `commit` in both workflow files and an updated test. — `docs/cycle/issues/done/refl-0078-cycle-0078-fix-never-applied-reflection.md`

- **`DOCUMENTATION.md`** — per-cycle artifact written to `docs/cycle/<cycle_id>-<slug>/DOCUMENTATION.md`. The documentation prompt captures stdout. No project-level `DOCUMENTATION.md` exists. The SPEC references this file meaning the cycle-level artifact. — `src/defaults/prompts/documentation.md:65`

### Existing Patterns to Follow

- **Issue lifecycle moves**: move file by renaming from `docs/cycle/issues/todo/` to `docs/cycle/issues/failed/` (or `done/`). Both source and raw variant files move together. — `docs/RFC-001-issue-lifecycle.md`

- **New todo issue format**: frontmatter with `id`, `title`, `workflow`, `depends_on`, `triaged_at`, `source: triage`. Body contains context and acceptance criteria. — `docs/cycle/issues/todo/` (existing files as pattern)

- **Verification finding = documentation + issue creation**: when a check fails, the artifact is a new todo issue file; when it passes, the artifact is a `DOCUMENTATION.md` entry. No code changes in either path.

- **DOCUMENTATION.md as cycle stdout capture**: documentation step writes stdout; engine captures it to `docs/cycle/<cycle_id>-<slug>/DOCUMENTATION.md`. For this cycle, build agent writes the file directly (no documentation step in this cycle's workflow). — `src/defaults/prompts/documentation.md:65`

### Dependencies & Integration Points

- **Dependency guard**: `refl-0078-cycle-0078-fix-never-applied-reflection` must be in `done/` — confirmed present at `docs/cycle/issues/done/refl-0078-cycle-0078-fix-never-applied-reflection.md`.

- **`41d5f26` "updates" commit**: this commit removed `reflection` from **both** workflow files on 2026-05-16 10:25 EDT. It deleted the step from `src/defaults/workflows.yml` (was at line 24, after `pr`) and from `.cycle/workflows.yml` (was after `commit`). This is the regression the SPEC anticipated.

- **`c11cfd1` cycle 0081**: claimed to apply the reflection-before-commit reorder. Git diff shows this commit did NOT change `src/defaults/workflows.yml` or `.cycle/workflows.yml` — it only created cycle artifacts. The step was briefly added then removed by `41d5f26`.

- **`aa07320` cycle 0101**: title claims to apply the reorder; git diff shows it added only cycle artifacts and one issue file. Did NOT change either workflow file.

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` with `strict assert`. No transpile step (`--experimental-strip-types`; requires Node ≥ 22.6).
- **Test directory**: `tests/defaults/` and `tests/dogfood/`.
- **Feature workflow pinning test (defaults)**: `tests/defaults/feature-yaml.test.ts:11` — currently asserts step order `["spec","research","plan","build","review","fix","verify","commit","pr","documentation"]` (10 steps, no `reflection`). Will need update if `reflection` is re-added.
- **Feature workflow pinning test (dogfood)**: `tests/dogfood/feature-yaml.test.ts` — currently asserts step order `["spec","research","plan","build","review","fix","verify","commit"]` (8 steps, no `reflection`). Will need update if `reflection` is re-added.
- **No new tests required** per SPEC — this cycle is verification + documentation only.
- **Pre-existing triage test failure**: `npm test` has a known failing triage test (child-reference batching error, observed in cycle 0108). The SPEC requires `npm test` to pass, but this pre-existing failure may cause the exit-code check to fail.

## Code References

- `src/defaults/workflows.yml:14-24` — feature workflow steps, reflection absent
- `.cycle/workflows.yml:17-29` — dogfood feature workflow steps, reflection absent
- `tests/defaults/feature-yaml.test.ts:11` — step-order assertion (no reflection), count guard = 10
- `tests/dogfood/feature-yaml.test.ts:11` — dogfood step-order assertion (no reflection), count guard = 8
- `docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md:5` — source issue, `depends_on: [refl-0078-cycle-0078-fix-never-applied-reflection]`
- `docs/cycle/issues/done/refl-0078-cycle-0078-fix-never-applied-reflection.md` — dependency confirmed in done/
- `src/defaults/prompts/documentation.md:65` — documentation step captures stdout → `DOCUMENTATION.md`
- `41d5f26` — "updates" commit that removed reflection from both workflow files

## Open Questions

1. **Pre-existing triage test failure**: `npm test` had a failing triage test as of cycle 0108. Does this failure still exist? The SPEC requires `npm test` to pass. The build agent should run `npm test` and determine if this is still present — if it is, the SPEC's "npm test must pass" criterion cannot be met without fixing it, which is out of scope. The build agent may need to document this conflict.

2. **DOCUMENTATION.md target path**: The SPEC says "update DOCUMENTATION.md". Given that no project-level `DOCUMENTATION.md` exists and the per-cycle artifact lives at `docs/cycle/0109-<slug>/DOCUMENTATION.md`, the build agent should write to `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md`.

3. **Source issue raw variant**: `docs/cycle/issues/done/refl-0078-reflection-artifacts-for-cycle-0078-will_raw.md` exists in `done/`. The `todo/` source issue file is `refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md`. These are distinct files (the `_raw.md` variant is already in `done/`; only the triaged file needs to move).
