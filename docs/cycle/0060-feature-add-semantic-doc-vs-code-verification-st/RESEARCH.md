```markdown
# Research: Cycle 0060

## Cycle Context

SPEC.md asks for a prompt-only extension to `src/defaults/prompts/review.md` adding a third review pass — "Pass 3: Doc-vs-Code Claim Verification" — that enumerates every command, flag, path, event name, frontmatter field, and behavioral claim introduced or modified in the diff under `README.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/**/*.md` (excluding `docs/cycle/*`), pairs each with a `file:line` reference at HEAD, and marks unbacked claims as a NEEDS-FIX trigger. The change includes a new `## Doc-vs-Code Claim Verification` REVIEW.md output block, MUST-FIX templating for unbacked-claim tasks, an "Overall Verdict" update, and a "pass skipped" sentinel for code-only diffs. The mirrored `.cycle/prompts/review.md` must stay byte-identical after the edit. No engine code, no `verify.sh`, no `documentation.md` changes are in scope.

## Current Codebase State

### Relevant Components

- Review prompt (default): two-pass structure today — `src/defaults/prompts/review.md:1-149`. Headings: `## Pass 1: Code Quality Review` (`src/defaults/prompts/review.md:25`), `## Pass 2: Adversarial Test Review` (`src/defaults/prompts/review.md:46`).
- Review prompt (dogfood mirror): byte-identical to defaults — `.cycle/prompts/review.md` (verified `cmp` clean at research time, no divergence to preserve in sync-state).
- REVIEW.md output template inside the prompt: `src/defaults/prompts/review.md:71-103`. Top of template carries `## Overall Verdict` at `src/defaults/prompts/review.md:74-75` with current NEEDS-FIX wording `[PASS — no fixes needed / NEEDS-FIX — see MUST-FIX.md]`.
- MUST-FIX.md template + rules inside the prompt: `src/defaults/prompts/review.md:105-142`. Task shape lives at `src/defaults/prompts/review.md:126-134`; rules block at `src/defaults/prompts/review.md:137-142`.
- Workflow wiring (consumer default): `src/defaults/workflows.yml:19-20` defines `review` and `fix` steps; `fix` carries `skip_unless: MUST-FIX.md`. The dogfood mirror — divergent on `no_branch: true` and the `commit-trunk.sh` swap — is at `.cycle/workflows.yml:18-31`.
- Engine artifact-write seam (single source for REVIEW.md on disk): `src/engine/run-cycle.ts:152-164`. The block reads `r.stdout` from the agent, calls `sanitizeArtifactStdout`, writes `${step.name.toUpperCase()}.md` under `artifactDir`, and special-cases `step.name === "spec"` for the byte-floor guard. `step.name === "review"` falls through the generic write — no engine special-case needed for this cycle.
- Sanitization helper: `src/engine/sanitize-artifact.ts` (referenced by the seam at `src/engine/run-cycle.ts:18,153`). Strips leading narration and a single outer fence, pure / idempotent. Pass 3 output rendered inside a fenced markdown table will pass through unchanged because the outer payload itself is not fenced; tables live inside the REVIEW.md body.

### Existing Patterns to Follow

- **Two-pass section structure already in the prompt.** `Pass 1` (`src/defaults/prompts/review.md:25-44`) and `Pass 2` (`src/defaults/prompts/review.md:46-64`) each open with a one-sentence brief and a bulleted `Check:` list. Pass 3 should mirror this shape so the agent reads it as a peer pass, not a footnote.
- **Conditional-pass sentinel phrasing.** The closest precedent for "pass skipped" wording is `src/defaults/prompts/fix.md:18-19`, which calls out `skip_unless: MUST-FIX.md` and tells the agent what to do when the step runs vs. doesn't. SPEC mandates a specific literal sentinel for Pass 3 on code-only diffs: `No documentation prose changed; pass skipped.` (SPEC line 31, acceptance criterion line 41 implied via "code-only diff").
- **Output-template heading prose.** Existing REVIEW.md template uses `## <Title>` for top-level blocks and `### <Subtitle>` for sub-sections, with an enumerated `Findings` list (`src/defaults/prompts/review.md:81-87,94-96`). New `## Doc-vs-Code Claim Verification` block follows the same heading level. Table column order per SPEC: `Claim | Source (doc:line) | Backing (code:line) | Status`.
- **MUST-FIX task shape.** The current task template (`src/defaults/prompts/review.md:126-134`) carries `Priority / Files / Problem / Fix / Verify`. SPEC requires the new unbacked-claim shape to include `doc:line`, claim prose, and `expected backing or "no backing exists"`. The natural mapping is to extend `Problem` formatting guidance and add a per-task field list for the doc-vs-code variant within the same Tasks section, not a parallel template.
- **Doc-path allow-list semantics.** No existing prompt enumerates the exact set (`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` excluding `docs/cycle/*`); the only adjacent reference is `src/defaults/prompts/documentation.md` (see `CLAUDE.md:74` for its summary, which carries the same allow-list semantics). Pass 3 wording should restate the set explicitly so the agent does not have to cross-reference another prompt.

### Dependencies & Integration Points

- **`fix` step gating depends on MUST-FIX.md existence.** Declared on `Step.skip_unless` at `src/engine/workflow.ts:10` and on the workflow row at `src/defaults/workflows.yml:20` / `.cycle/workflows.yml:28`. NOTE: a repo-wide grep for `skip_unless` enforcement (`src/engine/`, `src/cli*.ts`) returns only the type declaration — no engine code currently reads the field. SPEC's failure path ("NEEDS-FIX → MUST-FIX.md → fix step") relies on the reviewer writing MUST-FIX.md, the existing review-end behavior, and the downstream fix prompt assuming the file is present (`src/defaults/prompts/fix.md:18-19,23-24`). Pass 3 doesn't widen this contract — it adds a new class of MUST-FIX tasks but uses the same file path and the same review/fix handshake.
- **Sanitization wrapping.** `src/engine/run-cycle.ts:153` applies `sanitizeArtifactStdout` to the agent's stdout before the REVIEW.md write. The Pass 3 output template will appear in the final REVIEW.md as written by the agent; no extra escaping needed unless the agent wraps its full reply in an outer fence (which sanitize will unwrap by design — `CLAUDE.md:76`).
- **`sync-defaults` divergence guard.** Driven by `scripts/sync-defaults.mjs` and `.cycle/.sync-state.json` (`CLAUDE.md:25-50`). Today `review.md` is non-divergent (`cmp` clean), so the cycle must edit both files directly. If only one is edited, `sync-defaults` on a clean state would refuse to overwrite the divergent file (exit 2). The dogfood-sync regression test in SPEC §Testing Strategy guards against drift from this point forward.

### Test Infrastructure

- Test framework: Node's built-in `node:test` runner with `--experimental-strip-types` (no Jest, no Vitest). Spec reporter for stdout, LCOV emitted to `.cycle/coverage.lcov` (`package.json:25-29`, `CLAUDE.md` Commands table).
- Test conventions: tests live under `tests/<area>/<name>.test.ts`. Defaults-related tests are at `tests/defaults/`: `feature-yaml.test.ts` reads the YAML and pins the feature step sequence (`tests/defaults/feature-yaml.test.ts:6-13`); `feature-loadable.test.ts` exercises the loader against a tmp copy (`tests/defaults/feature-loadable.test.ts:8-22`); `sync-defaults-guard.test.ts` covers the divergence guard end-to-end (`tests/defaults/sync-defaults-guard.test.ts:29-193`).
- Test layout for prompt content assertions: no precedent today — there is no `tests/defaults/*-prompt-*.test.ts` file. The closest shape is `feature-yaml.test.ts` which reads a `src/defaults/*.yml` file via `readFile` and asserts on parsed content. The new test file `tests/defaults/review-prompt-doc-claim-pass.test.ts` (SPEC §Testing Strategy item 1) will read both `src/defaults/prompts/review.md` and `.cycle/prompts/review.md` and assert (a) heading presence, (b) doc-path allow-list contents, (c) sentinel string, (d) byte-equality between the two files.
- Coverage gates: per-file floor at `src/engine/triage.ts ≥ 95%` (`scripts/coverage-gate.mjs`, `CLAUDE.md` Coverage policy). Project floors: line ≥ 95%, branch ≥ 75%, function ≥ 90%. This cycle ships no `src/` code change, so coverage cannot regress on any per-file floor; the prompt and a new tests-only file should leave LCOV unchanged.

## Code References

- `src/defaults/prompts/review.md:1-9` — header prose declaring "two review passes"; this paragraph must be rewritten to "three review passes" without disturbing the surrounding context.
- `src/defaults/prompts/review.md:25-44` — Pass 1 section; do not edit.
- `src/defaults/prompts/review.md:46-64` — Pass 2 section; do not edit.
- `src/defaults/prompts/review.md:71-103` — REVIEW.md output template; insert `## Doc-vs-Code Claim Verification` block (claim table) at the bottom or between Pass 2 output and the trailing fence close. SPEC does not pin position but the natural read order is after `## Adversarial Test Review`.
- `src/defaults/prompts/review.md:74-75` — `## Overall Verdict` line, current single-bullet enum. SPEC requires unbacked-claim trigger to be enumerated explicitly here.
- `src/defaults/prompts/review.md:105-142` — MUST-FIX.md template + rules; the new unbacked-claim task shape lives here.
- `.cycle/prompts/review.md` — must be mirror-edited byte-for-byte.
- `src/engine/run-cycle.ts:152-164` — single artifact-write seam; no edit needed but planner should know REVIEW.md is written here (and that any reviewer prose lands on disk unchanged except for `sanitizeArtifactStdout`).
- `src/engine/workflow.ts:10` — `skip_unless?: string` type declaration; reviewed for context only.
- `src/defaults/workflows.yml:18-25` / `.cycle/workflows.yml:18-31` — `feature` workflow steps; reviewed for context only, not edited.
- `tests/defaults/feature-yaml.test.ts` — pattern reference for new prompt-content test.
- `tests/defaults/sync-defaults-guard.test.ts:81-106` — pattern reference for divergence assertions, though the new test asserts equality (negative of divergence).
- `CLAUDE.md:60-78` — Architecture quick reference; SPEC requires one-sentence Pass-3 note appended here.
- `docs/ARCHITECTURE.md` — grep for `"Pass 2"` / `"two-pass"` returns no matches (lines 103, 313, 422, 424, 458, 486, 489, 599, 603, 608, 616, 628, 653, 709, 828 mention `review` in generic terms only). Per SPEC §Documentation Updates the planner's edit here is conditional — given no two-pass language exists, no ARCHITECTURE.md edit is required.
- `README.md` — out of scope per SPEC §Documentation Updates.
- `docs/RFC-001-issue-lifecycle.md` — out of scope per SPEC §Documentation Updates.

## Open Questions

- **Placement of the `## Doc-vs-Code Claim Verification` block inside the REVIEW.md output template.** SPEC names the heading but does not pin position relative to `## Code Quality Review` and `## Adversarial Test Review`. Two natural placements: (a) after `## Adversarial Test Review` (mirrors prose flow Pass 1 → Pass 2 → Pass 3), (b) at the very bottom after `### Test Coverage` (keeps the existing Pass-2 block uninterrupted). Plan step to pick one.
- **MUST-FIX task template structure for unbacked claims.** SPEC requires the task to include `doc:line`, claim prose, and `expected backing or "no backing exists"`. Plan step to decide whether to (a) reuse the existing `Priority / Files / Problem / Fix / Verify` task with formatting guidance for the `Problem` body, or (b) introduce a parallel "Doc-vs-Code Unbacked Claim" task type with its own field list. The SPEC's MUST-FIX rules acceptance criterion (line 39) leans toward option (b) since it says the template "documents how unbacked-claim tasks should be shaped, including required fields"; planner should confirm.
- **Exact test-file location and assertion granularity.** SPEC pins the path `tests/defaults/review-prompt-doc-claim-pass.test.ts` and the assertion list (heading present, allow-list complete, sentinel present, byte-equal). Plan step to decide whether each assertion is a separate `test(...)` block or a single test with multiple `assert.match` calls; current convention in `tests/defaults/` is one `test(...)` per concern (`sync-defaults-guard.test.ts`) vs one combined `test(...)` (`feature-yaml.test.ts`) — both are precedented, planner picks.
- **Pass-skip wording for non-doc diffs.** SPEC line 31 fixes the sentinel string `No documentation prose changed; pass skipped.`. The planner needs to confirm whether the reviewer should also be instructed to *omit* the table rows entirely on code-only diffs (single sentinel line) versus emit a table-with-no-rows; SPEC's "single … line" phrasing implies the former.
```

Research doc emitted to stdout for engine capture as RESEARCH.md.
