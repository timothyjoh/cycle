Got enough. Emitting RESEARCH.md to stdout now.

```markdown
# Research: Cycle 0069

## Cycle Context
Cycle 0069 is a pure docs/state-debris cleanup. The repo carries (a) a dormant git stash `stash@{0}: cycle-0027-debris-quarantine` (2 files, 49 deletions) and (b) a phantom `docs/cycle/issues/todo/failed-blocked-frontmatter.md` that describes work already shipped in cycle 0025 (`b6662c3 cycle 0025: Add structured frontmatter to failed/ and blocked/ file moves (#35)`). The spec deletes the phantom todo via `git rm`, drops the stash after the deletion commit lands, and produces exactly one commit on master whose body cross-references cycles 0025 → 0027 → 0028 → 0069. No engine source, prompt, default, or schema files are modified.

## Current Codebase State

### Relevant Components
- Phantom todo file (only on-disk change target) — `docs/cycle/issues/todo/failed-blocked-frontmatter.md:1` (44 lines, frontmatter `id: failed-blocked-frontmatter`, `title: Add structured frontmatter to failed/ and blocked/ file moves`, `triaged_at: "2026-05-13T18:13:29.789Z"`, `source: triage`).
- Done-side counterpart (historical record, NOT touched) — `docs/cycle/issues/done/failed-blocked-frontmatter_raw.md`.
- Shipped feature that obsoletes the todo — `src/cli.ts:121-176` (`terminalDrain` helper). Stamps the four required fields:
  - `failed_at: new Date().toISOString()` — `src/cli.ts:135` (happy path), `src/cli.ts:162` (fallback path).
  - `failed_step: failingStep` — `src/cli.ts:136,163`.
  - `failed_attempts: failedAttempts` — `src/cli.ts:137,164`.
  - `last_cycle_id: cycleId` — `src/cli.ts:138,165`.
- Shipping commit — `b6662c3 cycle 0025: Add structured frontmatter to failed/ and blocked/ file moves (#35)` (from `git log --oneline --grep=frontmatter`).
- Live queue row for THIS cycle (must remain untouched; not the phantom) — single row in `.cycle/tbd.jsonl` keyed `id: refl-0028-dormant-stash-cycle-0027-debris-quaranti`, `status: in_progress`, `cycle_id: 0069`. The grep in SPEC.md's acceptance criterion (`grep failed-blocked-frontmatter .cycle/tbd.jsonl`) matches this row's title substring, NOT a phantom id row — the issue `id` field of every row in `tbd.jsonl` is verified to NOT be `failed-blocked-frontmatter`.

### Existing Patterns to Follow
- **Trunk-based, no-branch workflow.** `.cycle/workflows.yml:11-31` — local divergence from `src/defaults/workflows.yml`. The dogfood `feature` workflow runs `no_branch: true`, uses `scripts/commit-trunk.sh` (not `commit.sh`), and drops the `pr` step. Cycle 0069 will commit directly to `master`.
- **Engine-driven commit step.** `.cycle/scripts/commit-trunk.sh:1-87` stages everything per its denylist (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) plus gitlinks (`.cycle/scripts/commit-trunk.sh:11-35`), composes the commit subject `cycle ${CYCLE_ID}: ${CYCLE_TITLE}` (`commit-trunk.sh:79,81`), optionally appends a `Closes …` block sourced from the issue file via `closes_block` (`commit-trunk.sh:67-78`, `lib/closes.sh`), and pushes (`commit-trunk.sh:86-87`). It is the only legal commit seam for this cycle — the build/fix steps do not commit.
- **`git rm` in the build step.** The phantom file is tracked; the build step must use `git rm docs/cycle/issues/todo/failed-blocked-frontmatter.md` (or plain `rm` + let `commit-trunk.sh` re-detect the `D` status via `git status --porcelain` at `commit-trunk.sh:60`, which then issues `git add -u -- "$path"` at `commit-trunk.sh:56`).
- **Stash drop happens AFTER the commit lands** (SPEC.md Requirements bullet). Build step writes the deletion; commit step lands it; only then can `git stash drop stash@{0}` run safely. The cleanest seam is the commit step's tail (post-`git push`) — but `commit-trunk.sh` does not accept post-commit hooks. The plan step must decide whether to (i) run the stash drop manually inside the build step *after* invoking `git rm` but defer the commit semantics to the engine, or (ii) extend the build prompt to land both side-effects in sequence (the stash drop touches no tracked files, so it does not affect what `commit-trunk.sh` stages).
- **Commit body cross-reference convention.** Recent multi-cycle cleanups use `cycle <ID>: <title>` subjects and bodies that name predecessor cycles inline; see commits `bfe3e50 cycle 0062: terminalDrain lifecycle helper + bb-* orphan cleanup`, `3f980bb cycle 0068: Add regression test for commit.sh worktree-missing-path branch` for the prevailing tone. There is no template — body prose names the cycles.
- **Frontmatter helpers (NOT used in this cycle, only relevant if the cycle had to touch engine code).** `src/engine/frontmatter.ts` exports `parseFrontmatter` / `serializeFrontmatter` / `mutateFrontmatter`; consumed at `src/cli.ts:133,154,168`. Mentioned only because the phantom todo refers to them as the helpers a real implementation would use.

### Dependencies & Integration Points
- **Git stash.** `git stash list` currently shows exactly one entry: `stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine`. `git stash show stash@{0}` is `2 files / 49 deletions` covering `.cycle/tbd.jsonl.bootstrap-archive` (already absent at HEAD, cycle 0028 settled it) and `docs/cycle/issues/todo/failed-blocked-frontmatter.md` (still present, target of this cycle's deletion).
- **`gc.reflogexpire` (default 90 days)** is the wall clock the SPEC names; not invoked by any script — it is the operator-visible constraint that bounds when the stash can be silently reclaimed.
- **Live `.cycle/tbd.jsonl` row for this cycle.** The engine itself wrote `cycle_id: 0069, status: in_progress` on `cycle.start`. The cycle's deletion must NOT mutate that row; SPEC Out-of-Scope explicitly forbids `.cycle/tbd.jsonl` changes. The drain pass at `cycle.end` (driven by `src/engine/queue.ts` and `src/cli.ts:terminalDrain`) handles its own row removal on success — no cycle-side intervention required.
- **No imports.** The deleted file is a markdown doc; nothing under `src/` or `tests/` imports or references `failed-blocked-frontmatter.md` (verified via the spec's own scope analysis — markdown docs in `docs/cycle/issues/todo/` are queue artifacts, not code).

### Test Infrastructure
- **Framework.** Node native test runner with spec reporter, invoked via `npm test` (`pretest` rebuilds `dist/cycle.js` first). Coverage via `npm run test:coverage` → LCOV at `.cycle/coverage.lcov` → `posttest:coverage` runs `scripts/coverage-gate.mjs`.
- **Conventions.** Tests live in `tests/**/*.test.ts`, executed by `--experimental-strip-types`; no transpile step. Mocking uses Node's built-in `mock` namespace; no Jest/Vitest.
- **Coverage gate.** `scripts/coverage-gate.mjs` enforces a per-file floor (`src/engine/triage.ts ≥ 95% lines`). This cycle touches zero source files under `src/`, so the gate is structurally unaffected and the published baseline (line ≥95%, branch ≥75%, func ≥90%) must remain intact.
- **No new tests expected.** SPEC's Testing Strategy explicitly states "No new test files. No E2E. No UI surface." Manual verification is captured in the commit body via three shell commands.

## Code References
- `src/cli.ts:121-176` — `terminalDrain` happy path + `mutateFrontmatter`-failure fallback path; both stamp `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`. Confirms the shipped feature that makes the phantom todo redundant.
- `src/cli.ts:135-138` — happy-path stamp block (the four fields the phantom todo asks for, all live).
- `src/cli.ts:162-165` — fallback-path stamp block (same four fields, written when `mutateFrontmatter` throws; introduced by cycle 0062 per `bfe3e50`).
- `docs/cycle/issues/todo/failed-blocked-frontmatter.md:1-44` — the phantom file to be deleted. Lines 22-27 enumerate the four required frontmatter fields; all four are present in `src/cli.ts:135-138,162-165`.
- `docs/cycle/issues/done/failed-blocked-frontmatter_raw.md` — the historical raw copy already in `done/`; SPEC.md Documentation Updates says rely on this as the audit record and do not relocate.
- `docs/cycle/issues/todo/refl-0028-dormant-stash-cycle-0027-debris-quaranti.md:1-55` — this cycle's source issue file; remains in `todo/` for the duration of the cycle and is moved to `done/` by the engine's drain pass on success.
- `.cycle/workflows.yml:11-31` — trunk-based `feature` workflow definition.
- `.cycle/scripts/commit-trunk.sh:1-87` — the commit seam.
- `.cycle/scripts/commit-trunk.sh:11-22` — `is_denied` (denylist that the deletion target does NOT match — `docs/cycle/issues/todo/…` is staged normally).
- `.cycle/scripts/commit-trunk.sh:60` — `git status --porcelain --untracked-files=all` is what observes the deletion; the `D*` / `*D` branches at `commit-trunk.sh:54-57` handle a deleted-but-not-yet-`git rm`'d path by issuing `git add -u`. Either `git rm` or plain `rm` will therefore reach the commit cleanly.
- `git log --oneline --grep=frontmatter` → `b6662c3 cycle 0025: …` confirms the shipping commit.

## Open Questions

These need the plan step's judgment — research does not invent answers:

1. **Where exactly does `git stash drop stash@{0}` execute?** SPEC says "AFTER the deletion is committed". The natural seams are (a) inline in the build step prompt after the `git rm`, but BEFORE the engine's commit step (risk: stash dropped before the audit-trail commit is durable on remote — contradicts SPEC), or (b) inside the build step after invoking the deletion AND after manually verifying the working tree is in the right shape, accepting that the engine's commit step runs immediately after. The plan must pick one and justify against the SPEC's "AFTER the deletion is committed" sequencing requirement. Note that the dogfood `commit-trunk.sh` pushes to `origin/master` (`.cycle/scripts/commit-trunk.sh:86-87`), so the audit trail is durable post-`push`.
2. **`git rm` vs plain `rm`.** Both work given `commit-trunk.sh:54-60` handles `D` status entries. SPEC.md line 23 explicitly says "via `git rm`" — plan step should match the SPEC literal.
3. **Commit message body shape.** SPEC requires references to cycles 0025, 0027, 0028, 0069 plus disposition string `delete — work already shipped` (paraphrased "`disposition: delete (issue shipped in b6662c3)`" in Acceptance Criteria). The cycle title in `tbd.jsonl` is long ("Resolve dormant cycle-0027 debris stash: inspect failed-blocked-frontmatter.md, decide delete-vs-requeue, drop stash") and `commit-trunk.sh:79,81` will use it verbatim for the subject — plan must confirm whether the engine-emitted subject suffices or whether the build step's commit-trunk wrapper needs a `-m` body extension (currently no such hook exists in `commit-trunk.sh`; any body content must come from the optional `closes_block` at `commit-trunk.sh:67-78`, OR from issue-file body text consumed by `closes_block`). If the SPEC body requirements cannot be satisfied via `closes_block`, the plan must decide whether the build step writes the body content into the issue file's `Closes` block area pre-commit, or whether `commit-trunk.sh` must be (out-of-scope!) edited.
4. **Verification commands in the commit body.** SPEC.md Testing Strategy lists three exact shell commands to embed. The same hook question as #3 applies — `commit-trunk.sh` has no flag to append a verification-evidence body, so the plan must locate where in the build-step workflow these commands run and where their output (or just the literal commands) lands in the commit body.
```
