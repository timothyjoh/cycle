# Implementation Plan: Cycle 0071

## Overview
Extend the `plan` and `review` agent prompts (and dogfood mirrors) so every PLAN.md must emit a `## SPEC Acceptance Traceability` section pairing each SPEC acceptance bullet with a covering task id (or explicit `WAIVED — <rationale>`), and so the `review` step flags missing/incomplete traceability as a NEEDS-FIX trigger. Document the convention in `CLAUDE.md` and pin both prompts with one regression test.

## Current State (from Research)
- `src/defaults/prompts/plan.md:1-113` — plan prompt; output template at `:45-97`; numbered "Important Guidelines" 1–9 at `:99-113`. No traceability requirement today.
- `src/defaults/prompts/review.md:25-44` — Pass 1 checklist; `:106-111` lists NEEDS-FIX triggers in the REVIEW.md verdict prose; `:151-192` is the MUST-FIX.md output template, with the named "Unbacked Doc Claim" task shape at `:182-191`.
- `.cycle/prompts/{plan,review}.md` are byte-identical mirrors of source today (`diff` returns empty); neither is in the sync-defaults divergent set.
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-42` is the structural template: five tests using `node:test` + `node:assert/strict` + `node:fs/promises`, a `SRC`/`DOG` const pair, regex-anchored header pins, allow-list iteration, and a `Buffer.compare` byte-equivalence check.
- `CLAUDE.md:60-81` is the `## Architecture quick reference` block. Each entry is a flat bullet opening with a Title-Case label terminated by colon. The Pass-3 bullet at `:81` is the closest precedent: it names the source prompt file path and the pinning test file path.
- `scripts/sync-defaults.mjs` mirrors `src/defaults/*` → `.cycle/*`; running `npm run sync-defaults` (no `--force`) after source edits keeps mirrors current. No engine code changes are needed for this cycle.

## Desired End State
- `src/defaults/prompts/plan.md` carries a clause requiring an output `## SPEC Acceptance Traceability` section that re-quotes each SPEC `## Acceptance Criteria` bullet verbatim and pairs it with a `Task N` id or `WAIVED — <one-line rationale>`. The "Important Guidelines" list grows a 10th rule reinforcing the requirement, and the output-template fenced block grows the new section header right above `## Testing Strategy` at `:86`.
- `src/defaults/prompts/review.md` Pass 1 grows a checklist bullet making missing/incomplete traceability a NEEDS-FIX trigger; the verdict-prose trigger list at `:106-111` grows a clause; the MUST-FIX.md output template grows a named "Missing SPEC→PLAN Traceability" task shape parallel to the existing "Unbacked Doc Claim" shape at `:182-191`.
- `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` originals (verified by the new test and by `npm run sync-defaults` exiting 0).
- `CLAUDE.md` `## Architecture quick reference` grows a new flat bullet appended after the Pass-3 bullet at `:81`, named `SPEC→PLAN traceability:`, citing both prompt source paths and the new test path.
- `tests/defaults/plan-prompt-spec-traceability.test.ts` exists and pins: plan-prompt traceability anchor, review-prompt Pass-1 NEEDS-FIX clause, review-prompt MUST-FIX shape anchor, and byte-equivalence of both dogfood mirrors.
- `npm test`, `npm run test:coverage`, `npm run typecheck` all clean. Coverage no-regression (≥95% / ≥75% / ≥90%); per-file `src/engine/triage.ts` ≥ 95% unaffected since no engine code changes.

Verification: `git diff master...HEAD` touches only `src/defaults/prompts/{plan,review}.md`, `.cycle/prompts/{plan,review}.md`, `CLAUDE.md`, and `tests/defaults/plan-prompt-spec-traceability.test.ts`. No `src/engine/*.ts`, no `src/cli*.ts`, no `workflows.yml`, no `scripts/*`.

## What We're NOT Doing
- No static verify check that parses SPEC bullets and PLAN tasks (issue Direction #2). Deferred to a sibling cycle once the convention stabilizes.
- No retroactive audit or edit of past `docs/cycle/<id>-feature-*/PLAN.md` artifacts.
- No generalization to non-`feature` workflows.
- No edit to `spec` prompt — bullet syntax is "verbatim re-quote", not a new id scheme.
- No engine code changes (`src/engine/*.ts`, `src/cli*.ts`, `workflows.yml`, `scripts/*` all untouched).
- No `README.md` change (no consumer-CLI surface change).
- No `RFC-001` amendment — convention lives in `CLAUDE.md` per SPEC.
- No `docs/ARCHITECTURE.md` change — SPEC says "no change required" unless a "Workflow prompts" subsection already names prompt files individually; it does not, so leave it untouched.
- No change to `sync-defaults.mjs` behavior.

## Implementation Approach
This is a prompt+doc+test-only cycle. The shape is identical to the Pass-3 doc-claim-verification cycle that landed earlier: a clause in the prompt's "checklist" pass, a clause in the prompt's output-template, a clause in the verdict-trigger list, a corresponding MUST-FIX named task shape, a dogfood mirror sync, a `CLAUDE.md` flat-bullet entry, and a single prompt-pinning regression test. Land all source edits, run `npm run sync-defaults` to refresh mirrors, write the new test, then verify with `npm test`, `npm run test:coverage`, `npm run typecheck`.

Decisions resolving RESEARCH open questions:
1. **Anchor wording:** literal `## SPEC Acceptance Traceability` (matches SPEC line 18 verbatim). Regex `^## SPEC Acceptance Traceability$/m` pins both prompts.
2. **Plan prompt placement:** add the requirement in BOTH the output-template fenced block (new section header above `## Testing Strategy`) AND as a new 10th rule in "Important Guidelines". Belt-and-suspenders — Pass-3 uses the same pattern (Pass-3 section + output-template block + verdict trigger).
3. **MUST-FIX shape:** add a named "Missing SPEC→PLAN Traceability" task template parallel to the existing "Unbacked Doc Claim" shape at `review.md:182-191`. Named template makes the reviewer's job mechanical and mirrors the Pass-3 precedent exactly.
4. **CLAUDE.md placement:** append a new flat bullet after the Pass-3 bullet at `CLAUDE.md:81`, opening `SPEC→PLAN traceability:`. Matches the sibling shape; no new sub-heading. This keeps the new bullet within the Pass-3 reviewer's own doc-claim verification scope, so the new prompt clauses are themselves `file:line`-backed by the new bullet (and vice versa).

---

## Task 1: Add the traceability requirement to `src/defaults/prompts/plan.md`

### Overview
Extend the plan-step prompt so emitted PLAN.md must include a `## SPEC Acceptance Traceability` section pairing each SPEC acceptance bullet with a covering task id or explicit waiver.

### Changes Required
**File**: `src/defaults/prompts/plan.md`

**Edit 1 — output-template fenced block** (currently `:45-97`). Insert a new section between the last task block and `## Testing Strategy` at `:86`. The literal section header `## SPEC Acceptance Traceability` is the regex anchor the new test pins. Use this shape:

```markdown
## SPEC Acceptance Traceability

Re-quote every bullet from SPEC.md's `## Acceptance Criteria` section
verbatim and pair it with either the covering plan-task id or an
explicit waiver.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [exact bullet text including leading `[ ]`] | Task N | [optional] |
| [exact bullet text] | WAIVED — [one-line rationale] | |
```

**Edit 2 — Important Guidelines** at `:99-113`. Append a 10th rule:

```markdown
10. **SPEC→PLAN Traceability.** The PLAN.md output MUST include a
    `## SPEC Acceptance Traceability` section enumerating every bullet
    from SPEC.md's `## Acceptance Criteria` section verbatim, paired
    with a covering plan-task id or an explicit
    `WAIVED — <one-line rationale>`. If you cannot map every SPEC
    acceptance bullet to a task or a defended waiver, emit only the
    traceability stub and fail loudly rather than silently drop a
    bullet. The `review` step rejects PLAN.md with a missing or
    incomplete traceability section.
```

### Success Criteria
- [ ] `src/defaults/prompts/plan.md` contains exactly one occurrence of `^## SPEC Acceptance Traceability$` (regex, multi-line mode).
- [ ] The phrase `Re-quote every bullet from SPEC.md` is present.
- [ ] The 10th-rule label `**SPEC→PLAN Traceability.**` is present.
- [ ] File ends with the same trailing-newline shape as before (no spurious whitespace).
- [ ] `npm run typecheck` clean (no-op smoke for this file).

---

## Task 2: Add the NEEDS-FIX trigger to `src/defaults/prompts/review.md`

### Overview
Extend the review-step prompt so Pass 1 detects a missing or incomplete `## SPEC Acceptance Traceability` section in PLAN.md, treats it as a NEEDS-FIX trigger, and emits a named MUST-FIX task shape.

### Changes Required
**File**: `src/defaults/prompts/review.md`

**Edit 1 — Pass 1 checklist** at `:25-44`. Insert a new bullet after the existing "Plan adherence" bullet at `:38-39`:

```markdown
- **SPEC→PLAN traceability** — does PLAN.md include a
  `## SPEC Acceptance Traceability` section that re-quotes every
  bullet from SPEC.md's `## Acceptance Criteria` section verbatim
  and pairs it with a covering plan-task id or an explicit
  `WAIVED — <rationale>`? A missing or incomplete traceability
  section is a NEEDS-FIX trigger.
```

**Edit 2 — REVIEW.md output-template verdict triggers** at `:106-111`. Extend the trigger list so it reads:

```markdown
NEEDS-FIX triggers: code-quality findings, missing tests, coverage
regressions, missing SPEC requirements, any unbacked doc-vs-code
claim from Pass 3, OR a missing or incomplete SPEC→PLAN traceability
section in PLAN.md.
```

**Edit 3 — MUST-FIX.md output-template** at `:151-192`. Append a new named task shape after the "Unbacked Doc Claim" shape at `:182-191`, before the closing fence:

```markdown
- [ ] ### Task N (Missing SPEC→PLAN Traceability): [Short title]
  **Priority:** Critical
  **Files:** `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md`
  **Problem:** PLAN.md is missing the `## SPEC Acceptance Traceability`
    section OR the section omits one or more SPEC acceptance bullets
    (list the missing bullets verbatim).
  **Fix:** Edit PLAN.md to add the traceability section per the plan
    prompt's output template; re-quote each SPEC acceptance bullet
    verbatim and pair it with a covering plan-task id or an explicit
    `WAIVED — <one-line rationale>`.
  **Verify:** `grep -c "^## SPEC Acceptance Traceability$" PLAN.md`
    returns `1`; every bullet from SPEC.md's `## Acceptance Criteria`
    section appears verbatim in the table.
```

### Success Criteria
- [ ] `src/defaults/prompts/review.md` contains the Pass-1 phrase `SPEC→PLAN traceability`.
- [ ] The verdict-trigger sentence at `:106-111` mentions `traceability` (regex `traceability` case-insensitive, present in the verdict block).
- [ ] The MUST-FIX named-task header literal `### Task N (Missing SPEC→PLAN Traceability):` is present.
- [ ] File ends with the same trailing-newline shape as before.

---

## Task 3: Refresh dogfood mirrors via `npm run sync-defaults`

### Overview
Run sync-defaults to copy the edited source prompts into the dogfood `.cycle/prompts/` directory, preserving the byte-identity invariant.

### Changes Required
**Command**: `npm run sync-defaults`

The two edited files (`src/defaults/prompts/plan.md` and `src/defaults/prompts/review.md`) are NOT in the locally-divergent set (the only divergent file is `.cycle/workflows.yml`). The guard at `scripts/sync-defaults.mjs` will copy them cleanly and update `.cycle/.sync-state.json` with new sha256 pairs. Exit code 0 expected.

If the guard reports the prompt files as divergent (it should not, given they were byte-identical before this cycle started), STOP — inspect `.cycle/.sync-state.json` to confirm prior hashes match the unedited source. Do not pass `--force` blindly; investigate.

### Success Criteria
- [ ] `npm run sync-defaults` exits 0 with no `skipped … — locally divergent` lines.
- [ ] `diff src/defaults/prompts/plan.md .cycle/prompts/plan.md` returns empty.
- [ ] `diff src/defaults/prompts/review.md .cycle/prompts/review.md` returns empty.
- [ ] `git status` shows `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` modified (mirroring source edits).
- [ ] `.cycle/.sync-state.json` modified (new sha entries).

---

## Task 4: Document the convention in `CLAUDE.md`

### Overview
Append a new flat bullet to the `## Architecture quick reference` block at `CLAUDE.md:60-81`, naming the SPEC→PLAN traceability convention and citing the canonical prompt and test paths.

### Changes Required
**File**: `CLAUDE.md`

**Edit** — append a new bullet after the Pass-3 bullet at `:81` (which is currently the last bullet in the block):

```markdown
- SPEC→PLAN traceability: `src/defaults/prompts/plan.md` requires PLAN.md to carry a `## SPEC Acceptance Traceability` section re-quoting every SPEC `## Acceptance Criteria` bullet verbatim and pairing each with a covering plan-task id or `WAIVED — <one-line rationale>`. `src/defaults/prompts/review.md` Pass 1 makes a missing or incomplete traceability section a NEEDS-FIX trigger; the corresponding MUST-FIX shape is the named "Missing SPEC→PLAN Traceability" template in `review.md`. Dogfood mirrors `.cycle/prompts/{plan,review}.md` are byte-identical (pinned by `tests/defaults/plan-prompt-spec-traceability.test.ts`). Convention adopted after cycle 0028, where the plan step silently dropped one of four required RFC-001 line annotations.
```

The bullet shape mirrors the Pass-3 bullet at `:81`: opens with a Title-Case label terminated by colon, names both prompt source paths, names the pinning test path. Including the cycle-0028 incident reference satisfies the SPEC requirement "why it exists".

### Success Criteria
- [ ] `CLAUDE.md` contains the literal string `SPEC→PLAN traceability:`.
- [ ] The new bullet names `src/defaults/prompts/plan.md`, `src/defaults/prompts/review.md`, and `tests/defaults/plan-prompt-spec-traceability.test.ts`.
- [ ] The new bullet sits inside the `## Architecture quick reference` block (after the Pass-3 bullet that ends with `tests/defaults/review-prompt-doc-claim-pass.test.ts`).
- [ ] The Pass-3 doc-claim review of this very cycle treats the new bullet as backed: each prompt-path mention is verifiable against the edits from Tasks 1–2, and the test-path mention is verifiable against the file created in Task 5.

---

## Task 5: Add the regression test `tests/defaults/plan-prompt-spec-traceability.test.ts`

### Overview
Pin the new prompt clauses and dogfood-mirror byte-identity with a single test file modeled on `tests/defaults/review-prompt-doc-claim-pass.test.ts`.

### Changes Required
**File**: `tests/defaults/plan-prompt-spec-traceability.test.ts` (new)

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const PLAN_SRC = "src/defaults/prompts/plan.md";
const PLAN_DOG = ".cycle/prompts/plan.md";
const REVIEW_SRC = "src/defaults/prompts/review.md";
const REVIEW_DOG = ".cycle/prompts/review.md";

test("plan prompt declares SPEC Acceptance Traceability section header", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.match(body, /^## SPEC Acceptance Traceability$/m);
});

test("plan prompt enumerates verbatim-re-quote requirement", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("Re-quote every bullet from SPEC.md"),
    "missing verbatim-re-quote requirement phrase",
  );
});

test("plan prompt Important Guidelines carries SPEC→PLAN Traceability rule", async () => {
  const body = await readFile(PLAN_SRC, "utf8");
  assert.ok(
    body.includes("**SPEC→PLAN Traceability.**"),
    "missing 10th-rule label in Important Guidelines",
  );
});

test("review prompt Pass 1 names SPEC→PLAN traceability", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(
    body.includes("SPEC→PLAN traceability"),
    "missing Pass 1 SPEC→PLAN traceability bullet",
  );
});

test("review prompt verdict trigger list includes traceability", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.match(
    body,
    /NEEDS-FIX triggers:[\s\S]*traceability/,
    "verdict trigger list missing traceability mention",
  );
});

test("review prompt MUST-FIX template carries Missing SPEC→PLAN Traceability task shape", async () => {
  const body = await readFile(REVIEW_SRC, "utf8");
  assert.ok(
    body.includes("### Task N (Missing SPEC→PLAN Traceability):"),
    "missing named MUST-FIX task shape",
  );
});

test("dogfood plan prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(PLAN_SRC), readFile(PLAN_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/plan.md and .cycle/prompts/plan.md must match byte-for-byte",
  );
});

test("dogfood review prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(REVIEW_SRC), readFile(REVIEW_DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/review.md and .cycle/prompts/review.md must match byte-for-byte",
  );
});
```

Structural choices: top-of-file `const` paths (mirrors the Pass-3 test), one test per assertion (no shared mutable state), no setup/teardown, no mocks, pure `readFile` reads, both regex anchors (where uniqueness matters) and `includes` (where substring sufficiency is fine). The byte-equivalence tests use `Buffer.compare` (matches Pass-3 test convention exactly).

### Success Criteria
- [ ] `tests/defaults/plan-prompt-spec-traceability.test.ts` exists.
- [ ] All 8 tests pass when invoked via `npm test`.
- [ ] Test does not import anything from `src/` (pure prompt-file inspection).
- [ ] Removing the new section header from `plan.md` (or breaking either dogfood mirror) makes the relevant test fail — verify manually by temporarily corrupting the file and confirming red, then revert.

---

## Task 6: Full verification

### Overview
Run the project's required gates and confirm clean exit.

### Changes Required
**Commands**:
```sh
npm test
npm run test:coverage
npm run typecheck
```

### Success Criteria
- [ ] `npm test` — full suite green; the 8 new tests appear in the spec reporter output as `ok` / `pass`.
- [ ] `npm run test:coverage` — exits 0; `posttest:coverage` (`scripts/coverage-gate.mjs`) passes the `src/engine/triage.ts ≥ 95%` floor unchanged (no engine code touched, so triage.ts coverage is identical to baseline).
- [ ] Line / branch / function coverage at master baseline or better (≥95% / ≥75% / ≥90%). Record exact numbers in `BUILD.md` per project convention.
- [ ] `npm run typecheck` — clean, no warnings (this cycle is prompt+doc+test only, so this is a smoke check).
- [ ] `git diff --stat master...HEAD` shows only: `CLAUDE.md`, `src/defaults/prompts/plan.md`, `src/defaults/prompts/review.md`, `.cycle/prompts/plan.md`, `.cycle/prompts/review.md`, `.cycle/.sync-state.json`, `tests/defaults/plan-prompt-spec-traceability.test.ts`. No `src/engine/*`, no `src/cli*`, no `scripts/*`, no `workflows.yml`.

---

## SPEC Acceptance Traceability

Every bullet from SPEC.md's `## Acceptance Criteria` section is paired
with the plan task that covers it.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/prompts/plan.md carries a clause requiring a ## SPEC Acceptance Traceability section in emitted PLAN.md that re-quotes every SPEC acceptance bullet verbatim and pairs it with a covering plan task id or an explicit WAIVED — <rationale>.` | Task 1 | |
| `[ ] src/defaults/prompts/review.md Pass 1 carries a clause making a missing or incomplete traceability section in PLAN.md a NEEDS-FIX trigger, with a corresponding MUST-FIX task shape in Output 2.` | Task 2 | |
| `[ ] .cycle/prompts/plan.md and .cycle/prompts/review.md are byte-identical to their src/defaults/ originals after npm run sync-defaults runs cleanly (exit 0).` | Task 3 | See Task 2 of this MUST-FIX for the exit-code wording caveat. |
| `[ ] CLAUDE.md has a short subsection (under existing prompt/architecture context) naming the SPEC→PLAN traceability convention and pointing to the two prompt files as the canonical source.` | Task 4 | |
| `[ ] A new test under tests/defaults/ (e.g., plan-prompt-spec-traceability.test.ts) asserts: (a) src/defaults/prompts/plan.md contains the traceability clause; (b) src/defaults/prompts/review.md Pass 1 contains the traceability NEEDS-FIX clause; (c) .cycle/prompts/plan.md and .cycle/prompts/review.md byte-equal their source counterparts.` | Task 5 | |
| `[ ] npm test passes (full suite green, no pre-existing test regressions).` | Task 6 | |
| `[ ] npm run test:coverage passes the per-file gate; line/branch/function coverage does not regress vs master baseline (≥95% / ≥75% / ≥90%).` | Task 6 | |
| `[ ] npm run typecheck clean (no new warnings — this cycle is prompt+doc+test only, so this is a no-op smoke check).` | Task 6 | |

---

## Testing Strategy

### Unit Tests
- Single new test file: `tests/defaults/plan-prompt-spec-traceability.test.ts` with 8 tests pinning prompt clauses and dogfood byte-identity (see Task 5).
- Edge cases pinned:
  - Section-header anchor present in plan source.
  - Verbatim-re-quote phrase present in plan source.
  - 10th-rule label present in plan source.
  - Pass-1 trigger phrase present in review source.
  - Verdict-list trigger present in review source (regex spans the verdict block).
  - Named MUST-FIX task shape literal present in review source.
  - Both dogfood mirrors byte-identical to source.
- Anti-mock posture: no mocks, no setup, no shared state. Pure `node:fs/promises` reads. Matches the existing prompt-pinning test pattern exactly.

### Integration / E2E Tests
- None. No engine code path changes; no CLI surface change; no UI surface; no new subprocess.
- The "end-to-end" semantic enforcement (review agent reading the new prompt clauses and raising NEEDS-FIX on a deficient PLAN.md) is enforced by the review agent at run-time, not by a mechanical test in this cycle. The cycle's own review step is the first natural integration probe — if the new clauses are well-formed, the review agent's Pass 1 will accept this very PLAN.md's traceability section as valid and the cycle will land green.

## Risk Assessment
- **Risk: divergence guard refuses to overwrite mirror.** `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` are not in the locally-divergent set today, so the guard should not fire. **Mitigation**: if it does fire, do NOT pass `--force` blindly — inspect `.cycle/.sync-state.json` and compare against the unedited source to confirm no third party modified the mirrors between cycles. Only force-overwrite after confirming the mirror state was clean pre-edit.
- **Risk: Pass-3 doc-claim verification of this cycle's own diff flags the new `CLAUDE.md` bullet as unbacked.** The bullet cites three file paths: `src/defaults/prompts/plan.md` (backed by Task 1), `src/defaults/prompts/review.md` (backed by Task 2), `tests/defaults/plan-prompt-spec-traceability.test.ts` (backed by Task 5). The "convention adopted after cycle 0028" claim is historical context, not a code claim. **Mitigation**: ensure all three file paths exist and the named prompt clauses are present before the review step runs (Tasks 1, 2, 5 are the dependencies).
- **Risk: trailing-whitespace or trailing-newline drift in prompt edits breaks the byte-equivalence test indirectly.** Source edits, then sync-defaults copy, then byte-compare — any post-source mutation of the destination (e.g., editor autosave on the mirror) would diverge. **Mitigation**: only edit `src/defaults/prompts/*`; never edit `.cycle/prompts/*` directly. Run sync-defaults exactly once before invoking `npm test`.
- **Risk: agent ambiguity on "verbatim re-quote".** The plan prompt's new clause says "verbatim", but agents sometimes paraphrase. **Mitigation**: this risk is intrinsic to the prompt-tweak path (Direction #1) and is the explicit reason Direction #2 (static verify) is queued as a sibling cycle. Not in scope here; not a blocker.
- **Risk: 10th rule in "Important Guidelines" being mistaken for a numbered list renumber by the agent.** Numbered Markdown lists in this prompt already use literal `1.`–`9.` and agents preserve them. Adding `10.` follows the same shape; no renumber needed.
