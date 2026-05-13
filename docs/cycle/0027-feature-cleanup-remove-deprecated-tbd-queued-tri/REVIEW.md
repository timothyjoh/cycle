MUST-FIX written. Below is REVIEW.md content (engine captures stdout).

# Review: Cycle 0027

## Overall Verdict
NEEDS-FIX — one minor documentation defect (see MUST-FIX.md). SPEC acceptance criteria are substantively met: working tree matches SPEC, bootstrap-archive code path preserved, all gates green at or above baseline.

## Code Quality Review

### Summary
Cycle 0027 is a retry of cycle 0026 (which failed at the `commit` step with exit 128). It applies no new mutations — the SPEC-intended changes are already present as uncommitted edits inherited from cycle 0026's build/fix passes. The build step's work consisted entirely of (a) re-verifying the inherited state, (b) stashing out-of-scope debris so the engine's commit step picks up only the SPEC surface, and (c) rerunning gates. The substantive deliverable (a deleted dogfood artifact, three doc annotations, an untouched bootstrap-archive code path) is correct and matches SPEC.

### Findings
1. **Documentation drift**: BUILD.md's bucketed acceptance-grep table claims Σ=67 with bucket c=51, but the live post-stash grep returns Σ=62 with bucket c=46. The table was copied forward from cycle 0026's BUILD.md without re-running after Task 2's stash removed the `docs/cycle/0026-…/` dir (which contributed 5 hits). PLAN Task 3's explicit success criterion *"Σ matches the live `wc -l` output"* is violated. Bucket categorisation is correct; only counts are stale. — `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/BUILD.md:22-30,48`
2. **Stash-fragility risk (informational)**: PLAN Task 2 bundled `docs/cycle/0026-feature-…/` into the same `git stash` entry as cycle-0025 dogfood debris. The 0026 dir is repo history (a failed cycle's full SPEC/RESEARCH/PLAN/BUILD/REVIEW/FIX/VERIFY artifact set), not "debris" in the same sense as cycle-0025's untracked reflection raws. If the operator forgets the manual `git stash pop` documented in BUILD.md and the reflog later expires, that history is unrecoverable from the working tree. Not a SPEC violation, but worth surfacing in the cycle's PR description. — `docs/cycle/0027-feature-cleanup-remove-deprecated-tbd-queued-tri/PLAN.md:111-153`, `BUILD.md:39-44`
3. **Annotation regex boundary** (intentional, documented): RFC-001's three `(superseded — see § 12 BB-1)` annotations sit on lines where the deprecated folder name is wrapped in backticks (e.g., `` `queued/` (superseded …) ``). The acceptance grep `rg -n '(^|/)(tbd|queued|triaged)/'` requires a `^` or `/` boundary before the folder name, so the backtick prefix means RFC-001 contributes 0 grep hits despite carrying the three annotations. Bucket a is therefore correctly 0. Not a defect; called out so reviewers don't mistake it for a missing annotation. — `docs/RFC-001-issue-lifecycle.md:10,390,416`

### Spec Compliance Checklist
- [x] `.cycle/tbd.jsonl.bootstrap-archive` does not exist (staged `D`, 5 legacy rows removed).
- [x] `docs/cycle/issues/tbd/`, `queued/`, `triaged/` absent from working tree (`ls docs/cycle/issues/` returns only `blocked done failed raw todo`).
- [x] `rg -n '(^|/)(tbd|queued|triaged)/' src/ tests/` returns 0 hits.
- [x] Every `rg -n '(^|/)(tbd|queued|triaged)/' docs/` hit is categorisable (a=0, b=9, c=46, d=7, Σ=62 — categorisation correct; counts in BUILD.md need correction per Finding 1).
- [x] `CLAUDE.md` Architecture quick reference enumerates only the five live folders (verified at `CLAUDE.md:40` — references only `raw/`, `todo/`, `done/`, `blocked/`, `failed/`).
- [x] `README.md` references only live folders (verified — only `raw/`, `failed/`, `done/` mentioned).
- [x] RFC-001 annotated at lines 10, 390, 416 with `(superseded — see § 12 BB-1)`.
- [x] `docs/DOGFOOD.md` annotated inline near line 28; `docs/plans/2026-05-12-cycle-mvp-dogfood.md` annotated with top-of-file banner.
- [x] Bootstrap-archive code path intact: `pickArchivePath` (`src/engine/queue.ts:82`), `bootstrapArchiveIfLegacy` (`src/engine/queue.ts:100`). No source edits required.
- [x] `npm test` passes (287/287).
- [x] `npm run typecheck` clean, no output.
- [x] `npm run test:coverage`: line 97.14% / branch 90.64% / function 96.21% — identical to baseline, no per-file regression.
- [x] No `src/defaults/` edits, so `npm run sync-defaults` not required.

## Adversarial Test Review

### Summary
Strong — for what's in scope. SPEC explicitly states *"This cycle removes state and annotates docs; it does not change behaviour. … No new tests required."* No new tests were added. The relevant existing tests — the four `bootstrapArchiveIfLegacy` subtests in `tests/engine/queue.test.ts:88-154` — cover the legacy-detect-and-rename contract that SPEC requires preserved. They reran and passed in this cycle's gate.

### Findings
1. **Bootstrap-archive subtest coverage is genuine integration**, not mocked: each test uses `mkdtemp(join(tmpdir(), "cycle-…-"))` for an ephemeral repo root, exercises the real `bootstrapArchiveIfLegacy` (no stubs), and asserts both on the renamed archive's contents and on `.cycle/tbd.jsonl` being gone after the call. — `tests/engine/queue.test.ts:88-154`
2. **Both branches of `isLegacyLine` are covered**: legacy schema seeded by `"archives legacy file once"` (line 95) and new schema by `"idempotent on new-shape file"` (line 116). Branch coverage on `src/engine/queue.ts` is 86.90% with the uncovered ranges (51-52, 97, 107-108, 116-117) outside the legacy-detect path.
3. **Absent-file no-op is tested explicitly** (`"no-op on missing file"`, line 129) — this is the path SPEC most cares about preserving (cycle 0027 deleted this repo's archive, so future runs hit either the absent-file no-op or, on another repo, the legacy-rename branch).
4. **Collision-suffix path tested** (`"numeric suffix on collision"`, line 139) — ensures `pickArchivePath`'s `.bootstrap-archive.1` fallback still works.
5. **No mock abuse**: zero new mocks introduced; the entire test suite uses real filesystem operations on ephemeral roots (project convention per CLAUDE.md).
6. **No assertion weakness**: assertions are specific — e.g., `assert.equal(archived, true)`, `assert.equal(existsSync(legacyPath), false)`, content reads check the actual rewritten file rather than just existence.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **97.14% / 90.64% / 96.21%**
- Regressions vs base (per-file): none. `src/engine/queue.ts` 96.05% line / 86.90% branch / 100% function — identical to cycle 0026 baseline.
- New code without tests: none (no new code in this cycle).
- Specific scenarios missing tests: none required by SPEC. Bootstrap-archive contract is fully exercised by the four existing subtests.
