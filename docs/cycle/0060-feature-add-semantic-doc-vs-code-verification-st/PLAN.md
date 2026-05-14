Open questions resolved. Drafting plan now.

```markdown
# Implementation Plan: Cycle 0060

## Overview

Extend `src/defaults/prompts/review.md` with a third review pass ("Doc-vs-Code Claim Verification") that enumerates documentation prose changes, pairs each claim to a `file:line` at HEAD, and fails review on any unbacked claim. Mirror the edit byte-for-byte into `.cycle/prompts/review.md`, pin the contract with a new prompt-content test, and refresh sync state plus CLAUDE.md.

## Current State (from Research)

- `src/defaults/prompts/review.md` is 149 lines, two-pass structure (Pass 1 `:25`, Pass 2 `:46`), REVIEW.md output template at `:71-103`, Overall Verdict line at `:74-75`, MUST-FIX template at `:105-142`.
- `.cycle/prompts/review.md` is byte-identical to defaults (`diff` clean).
- Engine writes REVIEW.md through the single sanitize-and-write seam at `src/engine/run-cycle.ts:152-164`; no engine code changes are required.
- `tests/defaults/` already has prompt/yaml content tests (`feature-yaml.test.ts`, `sync-defaults-guard.test.ts`) read files via `readFile` and assert with `node:assert`. Tests follow one-`test(...)`-per-concern convention in `sync-defaults-guard.test.ts`.
- `npm run sync-defaults` records sha256 of both source and destination in `.cycle/.sync-state.json`; editing both files in lockstep then re-running `sync-defaults` keeps state consistent.

## Desired End State

- `src/defaults/prompts/review.md` and `.cycle/prompts/review.md` are byte-identical and each contain:
  - `## Pass 3: Doc-vs-Code Claim Verification` (after Pass 2).
  - `## Doc-vs-Code Claim Verification` block in the REVIEW.md output template (after `## Adversarial Test Review`, before the closing fence) with table columns `Claim | Source (doc:line) | Backing (code:line) | Status`.
  - A code-only-diff sentinel line: `No documentation prose changed; pass skipped.`
  - An updated `## Overall Verdict` enumeration that explicitly names unbacked claims as a NEEDS-FIX trigger.
  - A dedicated unbacked-claim task shape in the MUST-FIX template carrying `doc:line`, claim prose, and `expected backing or "no backing exists"`.
  - Header prose updated from "two review passes" → "three review passes".
- `tests/defaults/review-prompt-doc-claim-pass.test.ts` exists and pins (a) Pass 3 heading, (b) output-template heading, (c) doc-path allow-list, (d) sentinel string, (e) byte-equality between `src/defaults/prompts/review.md` and `.cycle/prompts/review.md`.
- `.cycle/.sync-state.json` reflects refreshed sha256 for `prompts/review.md` after running `npm run sync-defaults`.
- CLAUDE.md "Architecture quick reference" carries a one-sentence Pass-3 note.
- `npm test`, `npm run test:coverage`, `npm run typecheck` all pass; coverage gates hold at master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file `src/engine/triage.ts ≥ 95%`).

Verification:
- `diff src/defaults/prompts/review.md .cycle/prompts/review.md` returns empty.
- `grep -n "Pass 3: Doc-vs-Code Claim Verification" src/defaults/prompts/review.md .cycle/prompts/review.md` returns one hit per file.
- `node --test tests/defaults/review-prompt-doc-claim-pass.test.ts` passes (4–5 sub-tests).
- `npm test` reports the new test file and full suite green.

## What We're NOT Doing

- **No new engine code.** No edits to `src/engine/run-cycle.ts`, `src/engine/sanitize-artifact.ts`, `src/engine/workflow.ts`, `verify.sh`, or any other engine surface. Pass 3 is reviewer-prompt-only; failure surfaces through the existing `MUST-FIX.md → fix step` handshake.
- **No edits to `prompts/documentation.md`.** The documentation step is non-fatal post-merge and cannot gate cycle outcome.
- **No new `docs` workflow variant.** Out of scope per SPEC; deferred until prompt-only approach is shown insufficient.
- **No static doc-link infrastructure or auto-generated reference checks.** Out of scope per SPEC and source issue.
- **No edits to `README.md`** — Pass 3 has no user-facing CLI surface change.
- **No edits to `docs/RFC-001-issue-lifecycle.md`** — not a lifecycle change.
- **No edits to `docs/ARCHITECTURE.md`** — RESEARCH confirmed `grep -n "Pass 2\|two-pass" docs/ARCHITECTURE.md` returns no matches, so SPEC's conditional edit is a no-op.
- **No changes to `src/defaults/workflows.yml` or `.cycle/workflows.yml`.** Review step wiring unchanged.

## Implementation Approach

Three vertical slices, each independently testable:

1. **Slice 1 (Test First, red).** Write the new prompt-content test against the *desired* prompt shape. Run it; it fails. Pins the contract before editing the prompt.
2. **Slice 2 (Prompt edit, green).** Edit both `src/defaults/prompts/review.md` and `.cycle/prompts/review.md` in lockstep so the new test passes and byte-equality holds. Refresh `.cycle/.sync-state.json` via `npm run sync-defaults` so future syncs don't trip the divergence guard.
3. **Slice 3 (Doc note + verify).** Append the CLAUDE.md one-liner; run full `npm test`, `npm run test:coverage`, `npm run typecheck`; confirm coverage gates hold.

Open-question resolutions baked into the plan:

- **Q1 (placement of output block):** chosen = after `## Adversarial Test Review`, before the closing template fence. Mirrors prose flow Pass 1 → 2 → 3.
- **Q2 (MUST-FIX template shape):** chosen = additive parallel task shape ("Unbacked Claim" variant) within the same Tasks section, keeping the existing `Priority / Files / Problem / Fix / Verify` task template untouched. SPEC line 39's wording ("documents how unbacked-claim tasks should be shaped, including required fields") reads as a dedicated shape, not an overloaded `Problem` body.
- **Q3 (test granularity):** chosen = one `test(...)` per concern (5 tests total). Matches `sync-defaults-guard.test.ts` convention; sharper failure signal.
- **Q4 (code-only sentinel format):** chosen = heading + single sentinel sentence only, no table rows. SPEC line 31's "single … line" wording is unambiguous.

---

## Task 1: Pin the contract with a new prompt-content test

### Overview

Add `tests/defaults/review-prompt-doc-claim-pass.test.ts` that reads `src/defaults/prompts/review.md` and `.cycle/prompts/review.md` and asserts every Pass-3 contract requirement. Test starts red (prompt unchanged); flips green after Task 2.

### Changes Required

**File**: `tests/defaults/review-prompt-doc-claim-pass.test.ts` (new)
**Changes**: New file. Five `test(...)` blocks, one per concern. Follow `tests/defaults/feature-yaml.test.ts` shape (Node test runner, `node:assert/strict`, `readFile` from `node:fs/promises`). Sketch:

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const SRC = "src/defaults/prompts/review.md";
const DOG = ".cycle/prompts/review.md";

test("review prompt declares Pass 3 doc-vs-code section heading", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /^## Pass 3: Doc-vs-Code Claim Verification$/m);
});

test("review prompt output template includes Doc-vs-Code block", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /^## Doc-vs-Code Claim Verification$/m);
});

test("review prompt names the in-scope doc allow-list and excludes docs/cycle", async () => {
  const body = await readFile(SRC, "utf8");
  for (const tok of ["README.md", "CLAUDE.md", "AGENTS.md", "docs/**/*.md"]) {
    assert.ok(body.includes(tok), `allow-list missing ${tok}`);
  }
  assert.match(body, /docs\/cycle\/\*/);
  assert.match(body, /excluding `docs\/cycle\/\*`|excludes? `docs\/cycle\/\*`/);
});

test("review prompt carries the code-only-diff pass-skipped sentinel", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("No documentation prose changed; pass skipped."),
    "missing sentinel string",
  );
});

test("dogfood review prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(
    Buffer.compare(src, dog),
    0,
    "src/defaults/prompts/review.md and .cycle/prompts/review.md must match byte-for-byte",
  );
});
```

### Success Criteria

- [ ] File compiles under `npm run typecheck` (no `any` leaks).
- [ ] `node --test tests/defaults/review-prompt-doc-claim-pass.test.ts` fails initially (red — Task 2 not yet done).
- [ ] All five tests are listed by the spec reporter when run.

---

## Task 2: Add Pass 3 to the review prompt (default + dogfood mirror)

### Overview

Edit `src/defaults/prompts/review.md` to add Pass 3, the new output-template block, the updated Overall Verdict, and the unbacked-claim task shape. Apply the same edit byte-for-byte to `.cycle/prompts/review.md`. Run `npm run sync-defaults` so `.cycle/.sync-state.json` records the new sha256 pair.

### Changes Required

**File**: `src/defaults/prompts/review.md`

Five concrete edits (line numbers refer to current HEAD):

1. **Header rewrite — lines 1–8.** Replace:
   ```
   You are a staff engineer reviewing the completed cycle work. You perform
   **two review passes**: code quality AND adversarial test review. You
   produce one or two output documents.
   ```
   with:
   ```
   You are a staff engineer reviewing the completed cycle work. You perform
   **three review passes**: code quality, adversarial test review, AND
   doc-vs-code claim verification. You produce one or two output documents.
   ```

2. **Insert Pass 3 section after Pass 2 (after current line 64, before `## Output 1: REVIEW.md` at line 66).** Add:
   ```
   ## Pass 3: Doc-vs-Code Claim Verification

   Verify that every documentation prose change in the diff is backed by a
   real `file:line` reference in the source.

   **Scope:** apply this pass only to diffs that touch `README.md`,
   `CLAUDE.md`, `AGENTS.md`, or `docs/**/*.md` **excluding `docs/cycle/*`**.
   If the diff touches none of these paths, emit a single line under the
   Doc-vs-Code block in REVIEW.md:

   > No documentation prose changed; pass skipped.

   …and skip the rest of this pass.

   Otherwise:

   1. **Enumerate** every command invocation, CLI flag, file path, event
      name (e.g. `engine.paused`), frontmatter field, and behavioral
      claim that is *introduced or modified* in the diff under the
      in-scope doc paths.
   2. **Pair** each enumerated item with a single `file:line` reference
      at HEAD proving the claim holds — e.g. the flag is parsed at
      `src/cli/parse-args.ts:NN`, the event is emitted at
      `src/engine/<x>.ts:NN`, the frontmatter field is read at
      `src/engine/frontmatter.ts:NN`.
   3. **Flag as unbacked** any item where pairing fails (no matching
      reference exists) OR where the paired reference contradicts the
      documented prose. Each unbacked claim becomes a MUST-FIX task
      (see the Unbacked Claim task shape under Output 2).

   Unbacked claims are a NEEDS-FIX trigger.
   ```

3. **Update Overall Verdict (current line 75).** Replace:
   ```
   [PASS — no fixes needed / NEEDS-FIX — see MUST-FIX.md]
   ```
   with:
   ```
   [PASS — no fixes needed / NEEDS-FIX — see MUST-FIX.md]

   NEEDS-FIX triggers: code-quality findings, missing tests, coverage
   regressions, missing SPEC requirements, OR any unbacked doc-vs-code
   claim from Pass 3.
   ```

4. **Insert Doc-vs-Code output block in the REVIEW.md template (after `### Test Coverage` block ending at current line 102, before the closing ```` ``` ```` at line 103).** Add:
   ```
   ## Doc-vs-Code Claim Verification

   *(If diff touches no in-scope doc path, replace this block with the
   single line:
   `No documentation prose changed; pass skipped.`)*

   | Claim | Source (doc:line) | Backing (code:line) | Status |
   |---|---|---|---|
   | [Prose snippet] | `path/to/doc.md:LL` | `src/path/to/file.ts:NN` | OK / UNBACKED |
   ```

5. **Add Unbacked Claim task shape to MUST-FIX template (after current line 134's Task 2 placeholder, before line 137 `**Rules for MUST-FIX.md:**`).** Add:
   ```
   - [ ] ### Task N (Unbacked Doc Claim): [Short title]
     **Priority:** Critical
     **Doc:** `path/to/doc.md:LL`
     **Claim prose:** "[exact quoted sentence from the doc]"
     **Expected backing:** [path/to/code.ts:NN with the behavior the prose describes] OR `no backing exists`
     **Fix:** [Either: edit the doc to match the code at <ref>; OR: add the
       missing code at <ref> and link it; OR: delete the prose if the
       behavior is not in fact promised.]
     **Verify:** `grep -n "<doc snippet>" path/to/doc.md` returns the
       updated line; cross-check matches the named `file:line`.
   ```

**File**: `.cycle/prompts/review.md`
**Changes**: Apply the exact same five edits (or simpler: after editing `src/defaults/prompts/review.md`, `cp src/defaults/prompts/review.md .cycle/prompts/review.md`). Confirm byte-identical via `diff src/defaults/prompts/review.md .cycle/prompts/review.md`.

**File**: `.cycle/.sync-state.json` (managed)
**Changes**: Run `npm run sync-defaults` after the file edits so the script re-hashes both files and updates the recorded sha pair. Since current dst == current src, the script will not flag divergence and will refresh state cleanly (no `--force` needed).

### Success Criteria

- [ ] `diff src/defaults/prompts/review.md .cycle/prompts/review.md` is empty.
- [ ] `grep -c "Pass 3: Doc-vs-Code Claim Verification" src/defaults/prompts/review.md` returns `1`.
- [ ] `grep -c "No documentation prose changed; pass skipped." src/defaults/prompts/review.md` returns `2` (one in Pass 3 body, one in output-template note).
- [ ] `node --test tests/defaults/review-prompt-doc-claim-pass.test.ts` — all 5 tests pass.
- [ ] `npm run sync-defaults` exits 0; `.cycle/.sync-state.json` shows the new sha for `prompts/review.md`.
- [ ] Full `npm test` passes (392+ tests, no regressions).

---

## Task 3: Document the new pass in CLAUDE.md and verify gates

### Overview

Append a one-sentence note under `## Architecture quick reference` in CLAUDE.md so future agents see the contract from the index. Run the full verification pipeline.

### Changes Required

**File**: `CLAUDE.md`
**Changes**: Append (or insert near the existing review-related bullets) a single line under `## Architecture quick reference`:

```
- Review step Pass 3: `src/defaults/prompts/review.md` carries a `## Pass 3: Doc-vs-Code Claim Verification` clause that enumerates command/flag/path/event/frontmatter/behavioral claims introduced or modified in the diff under `README.md`, `CLAUDE.md`, `AGENTS.md`, and `docs/**/*.md` (excluding `docs/cycle/*`), pairs each with a `file:line` reference at HEAD, and treats unbacked claims as a NEEDS-FIX trigger that flows through MUST-FIX.md → fix step like any other reviewer finding. The dogfood mirror at `.cycle/prompts/review.md` is byte-identical (pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts`).
```

### Success Criteria

- [ ] `grep -n "Pass 3" CLAUDE.md` returns at least one hit.
- [ ] `npm run typecheck` — no warnings, no errors.
- [ ] `npm test` — full suite green.
- [ ] `npm run test:coverage` — gates hold: line ≥ 95%, branch ≥ 75%, function ≥ 90%; `scripts/coverage-gate.mjs` exits 0 (per-file `src/engine/triage.ts ≥ 95%` unchanged since no engine code edit).
- [ ] `diff src/defaults/prompts/review.md .cycle/prompts/review.md` empty (final guard).

---

## Testing Strategy

### Unit Tests

The single new test file `tests/defaults/review-prompt-doc-claim-pass.test.ts` carries all five contract assertions for this cycle:

1. Pass 3 section heading present in defaults.
2. Output-template `## Doc-vs-Code Claim Verification` heading present in defaults.
3. Allow-list completeness — `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**/*.md` named and `docs/cycle/*` explicitly excluded.
4. Code-only-diff sentinel string `No documentation prose changed; pass skipped.` present.
5. Byte-equality between `src/defaults/prompts/review.md` and `.cycle/prompts/review.md`.

**Anti-mock posture:** all five tests read real files from disk (`readFile`). No mocks, no fakes, no fixtures. Same pattern as `feature-yaml.test.ts` and `sync-defaults-guard.test.ts`. The dogfood-sync regression assertion (#5) is exactly the kind of test that would have caught the 0046 sync incident if the same shape existed for `workflows.yml`.

### Integration / E2E Tests

Not applicable — no runtime code change, no engine event surface, no CLI surface. The "integration" surface for this cycle is the agent prompt itself, and prompt content is fully covered by the structural assertions above.

The prompt's runtime behavior (does the reviewer actually emit the table?) is observable only by running an end-to-end cycle through the `feature` workflow, which is the system's normal exercise loop. No new harness needed — the next reflection-surfaced doc-touching cycle will exercise Pass 3 in production and either pass cleanly or surface MUST-FIX tasks.

## Risk Assessment

- **Risk: edit lands in defaults but not the dogfood mirror (or vice versa).**
  Mitigation: Task 1's byte-equality test fails the suite immediately. Backup mitigation: Task 2 mandates `npm run sync-defaults` which would catch divergence at exit 2.

- **Risk: `sync-defaults` flags the edited file as locally divergent and exits 2.**
  Mitigation: Edit both files to the exact same content in Slice 2 before running `sync-defaults`. Since `current dst sha == current src sha`, the script's "matches current `src_sha256`" branch fires and no divergence is reported. If divergence is reported anyway, the editor accidentally desynced — fix by re-copying `src/defaults/prompts/review.md` over `.cycle/prompts/review.md` and re-running.

- **Risk: reviewer agent ignores Pass 3 in practice and emits the old two-pass template.**
  Mitigation: out of scope for prompt-only testing — would only surface in a live cycle's REVIEW.md. SPEC and the source issue treat this risk as acceptable because the prompt-only approach is the smaller slice; a follow-up cycle can promote Pass 3 to a separate `docs` workflow variant if drift recurs.

- **Risk: Coverage gate trips even though no `src/` code changed.**
  Mitigation: This cycle adds a test file only. LCOV reports for `src/**` are unaffected by adding tests, so coverage cannot regress. If gate trips, the regression came from elsewhere — flag in REVIEW.md, do not silently widen the floor.

- **Risk: Prompt prose grows long enough to hit reviewer context limits.**
  Mitigation: Pass 3 adds ~30 lines; current prompt is 149 lines. New total ≈ 180 lines, well within any agent's context budget. No mitigation needed beyond ordinary review.

- **Risk: The plan's MUST-FIX "Unbacked Claim" task shape gets confused with the standard task shape by future fix agents.**
  Mitigation: Task shape is labeled `### Task N (Unbacked Doc Claim): …` so the variant is unambiguous in the rendered MUST-FIX.md. The Pass-3 body explicitly names the variant in its instruction text, giving the reviewer one place to look.
```

Plan written. Three vertical slices: test scaffold (red) → prompt edit + mirror sync → CLAUDE.md note + full verify. All four open questions from RESEARCH resolved inline (placement after Pass 2, parallel "Unbacked Claim" task variant, one `test(...)` per concern, heading-only sentinel on code-only diffs).
