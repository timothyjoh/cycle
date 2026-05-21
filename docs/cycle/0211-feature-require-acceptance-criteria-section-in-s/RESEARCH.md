`★ Insight ─────────────────────────────────────`
The `tests/defaults/` directory holds all prompt-content tests. Each file pairs a content assertion (checking for a required phrase via `includes` or `match`) with a byte-equality dogfood test. Every new phrase the planner adds to a prompt should be pinned by a matching test here — even though SPEC says "no new unit tests required," the existing pattern strongly suggests otherwise and the AC tests in `verify-prompt-spec-ac.test.ts` were added exactly for this reason.
`─────────────────────────────────────────────────`

```markdown
# Research: Cycle 0211

## Cycle Context

SPEC asks for two prompt-text edits: (1) add explicit mandatory-section prose to `src/defaults/prompts/spec.md` making `## Acceptance Criteria` a required output with prescriptive bullet-format instructions, and (2) update `src/defaults/prompts/review.md` Pass 1 to instruct the reviewer to verify each SPEC AC bullet one-for-one and to flag a missing/empty AC section as a SPEC defect rather than a PLAN gap. After both edits, `npm run sync-defaults` must be run to propagate changes to `.cycle/prompts/`. No engine code changes.

## Current Codebase State

### Relevant Components

- **spec prompt (src)**: `src/defaults/prompts/spec.md` — 113 lines. The output template (lines 26–70) already contains `## Acceptance Criteria` with four placeholder bullets (lines 50–54), but there is **no prose instruction** in the prompt body mandating this section, requiring testable bullets, or specifying bullet format. The output block is the entire enforcement mechanism.
- **spec prompt (dogfood)**: `.cycle/prompts/spec.md` — byte-identical to `src/defaults/prompts/spec.md` (visual comparison confirms; divergence guard protects it). 
- **review prompt (src)**: `src/defaults/prompts/review.md` — 227 lines. Pass 1 (lines 26–51) contains a `SPEC→PLAN traceability` bullet (lines 38–43) that checks whether PLAN.md re-quotes SPEC AC bullets verbatim. It does **not** contain an instruction to verify SPEC AC bullets one-for-one against the implementation itself, does not flag a missing/empty `## Acceptance Criteria` section as a SPEC defect, and does not prohibit accepting PLAN-inferred criteria as substitutes. The NEEDS-FIX triggers line (lines 116–119 of REVIEW.md output template) lists traceability but does not mention missing AC section.
- **review prompt (dogfood)**: `.cycle/prompts/review.md` — byte-identical to `src/defaults/prompts/review.md`.
- **sync-defaults script**: `scripts/sync-defaults.mjs` — copies every file under `src/defaults/` to `.cycle/` using sha256 divergence guard; records state in `.cycle/.sync-state.json`. Run via `npm run sync-defaults`. Exit 0 on full sync; exit 2 if any destination file is locally divergent and `--force` not set.

### Existing Patterns to Follow

- **Prompt content tests** (`tests/defaults/`): Each prompt edit is pinned by one or more `node:test` tests in `tests/defaults/<prompt-slug>-prompt-<topic>.test.ts`. Tests use `readFile(SRC, "utf8")` + `assert.ok(body.includes("..."))` or `assert.match(body, /regex/m)`. Every test file also includes a byte-equality dogfood test comparing `src/defaults/prompts/<name>.md` vs `.cycle/prompts/<name>.md`.
  - `tests/defaults/verify-prompt-spec-ac.test.ts:8` — checks `verify.md` requires per-AC targeted assertion
  - `tests/defaults/plan-prompt-spec-traceability.test.ts:10` — checks `plan.md` declares traceability section header
  - `tests/defaults/review-prompt-doc-claim-pass.test.ts:8` — checks `review.md` Pass 3 heading, output template block, allow-list, sentinel string
  - All test files end with a `"dogfood ... is byte-identical to default"` test
- **Prompt prose placement**: New mandatory-section instructions in `spec.md` belong as a named section in the prompt body (e.g., between `## Write the Spec` and `## Cycle Sizing`), not embedded inside the fenced output template. The output template is illustrative; prose instructions above it are normative.
- **Review Pass 1 bullet format**: Existing Pass 1 bullets are bold-labeled one-liners with a description sentence (e.g., `- **SPEC→PLAN traceability** — does PLAN.md include a ... ?`). New bullets should follow the same pattern.

### Dependencies & Integration Points

- `scripts/sync-defaults.mjs` — must be run after editing prompts; covered by `tests/defaults/plan-prompt-spec-traceability.test.ts:56` and `review-prompt-doc-claim-pass.test.ts:35` byte-equality tests, which will fail if sync is skipped.
- `tests/defaults/plan-prompt-spec-traceability.test.ts:31` — already tests that `review.md` contains `"SPEC→PLAN traceability"` and `"NEEDS-FIX triggers:"`. Any new review.md edit must keep those strings intact.
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:35` — byte-equality test for `review.md`; will fail until sync-defaults is run after editing.

### Test Infrastructure

- **Test framework**: Node.js built-in `node:test` + `node:assert/strict`; no transpile step (`--experimental-strip-types`); run via `npm test` (pretest builds dist first) or `npm run test:coverage`.
- **Test conventions**: `tests/defaults/<topic>.test.ts`; tests read prompt files from disk directly; no mocking; assertions use `includes` for substring checks and `match` for regex checks; byte-equality check compares src vs dogfood paths.
- **Coverage of change area**: `tests/defaults/` files are included in coverage. The spec prompt currently has no dedicated test file. The review prompt is covered by `review-prompt-doc-claim-pass.test.ts` and `plan-prompt-spec-traceability.test.ts` (partial). Any new phrases added to spec.md or review.md that are not pinned by a test will go untested; the SPEC says "no new unit tests required" but the pattern in the codebase contradicts this for prompt content changes.

## Code References

- `src/defaults/prompts/spec.md:50–54` — existing `## Acceptance Criteria` placeholder in output template (4 checkbox bullets, no prose mandate)
- `src/defaults/prompts/spec.md:26–70` — full fenced output template block
- `src/defaults/prompts/review.md:26–51` — Pass 1 check list, including `SPEC→PLAN traceability` bullet at lines 38–43
- `src/defaults/prompts/review.md:116–119` — NEEDS-FIX triggers line in REVIEW.md output template
- `src/defaults/prompts/review.md:128–130` — `### Spec Compliance Checklist` inside REVIEW.md output template
- `tests/defaults/verify-prompt-spec-ac.test.ts:8–13` — pattern for content assertion test
- `tests/defaults/plan-prompt-spec-traceability.test.ts:56–63` — byte-equality pattern for plan+review dogfood tests
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:35–42` — byte-equality pattern for review dogfood test
- `scripts/sync-defaults.mjs:17–18` — `SRC_ROOT = "src/defaults"`, `DST_ROOT = ".cycle"` constants

## Open Questions

1. **Placement of new spec.md prose**: Should the mandatory-section instruction be added as a new named section in the prompt body (e.g., `## Required Sections`), or as a sub-bullet/callout inside the existing `## Write the Spec` section? The planner must decide where to anchor it relative to the output template.
2. **Test file naming for spec.md content tests**: Should new tests live in a new file `tests/defaults/spec-prompt-ac.test.ts` (matching the per-prompt-per-topic pattern) or appended to an existing file? No `spec-prompt-*.test.ts` file currently exists.
3. **SPEC says no new tests**: The SPEC explicitly states no new unit tests are required. However, every comparable prompt-content change in this codebase has been pinned by a `tests/defaults/` test. The planner should resolve this tension — either add tests (following the pattern) or accept the absence and note the inconsistency.
4. **review.md NEEDS-FIX trigger wording**: The existing trigger line spans both the Pass 3 output template and the prose block. Adding "missing AC section" to the trigger list requires identifying the right insertion point without breaking `plan-prompt-spec-traceability.test.ts:39`'s regex (`/NEEDS-FIX triggers:[\s\S]*traceability/`).
```
