Full picture confirmed. Writing the RESEARCH.md to stdout as required.

---

```markdown
# Research: Cycle 0212

## Cycle Context

SPEC.md asks for a prompt-only fix to `src/defaults/prompts/spec.md`: add explicit
language identifying `SPEC.md` as a **file artifact** (not a conversation turn) and
explicitly prohibiting insight/`★` blocks and "Spec written to…"-style confirmation
messages. The change propagates to `.cycle/prompts/spec.md` via `npm run sync-defaults`.
No src/ logic changes, no new tests beyond assertions in the existing prompt-test file.

## Current Codebase State

### Relevant Components

- **Spec prompt source**: `src/defaults/prompts/spec.md` — 122 lines. This is the
  authoritative template. The engine reads it from `.cycle/prompts/spec.md` at runtime.
- **Spec prompt deployed copy**: `.cycle/prompts/spec.md` — byte-identical to
  `src/defaults/prompts/spec.md` (verified: `diff` exits 0). This is what the agent
  actually receives as its prompt.
- **Sync script**: `scripts/sync-defaults.mjs` — copies every file under
  `src/defaults/` → `.cycle/`. Uses sha256 divergence guard: if `.cycle/` copy was
  locally modified, skips (exit 2) unless `--force`. Records state in
  `.cycle/.sync-state.json`. Run via `npm run sync-defaults`.
- **Artifact sanitizer**: `src/engine/sanitize-artifact.ts:5` — `sanitizeArtifactStdout`
  strips leading narration lines matching `^(Now|Next|Here is|Output)\b`, strips outer
  markdown fences, trims trailing whitespace. Does **not** strip `★ Insight` blocks or
  "Spec written to…" confirmation lines.
- **Spec post-condition guard**: `src/engine/run-cycle.ts:310-316` — only checks
  `Buffer.byteLength(sanitized) < SPEC_MIN_BYTES` (200). No content-pattern check.
- **Spec prompt test file**: `tests/defaults/spec-prompt-ac.test.ts` — 40 lines. Uses
  `readFile("src/defaults/prompts/spec.md")` + `assert.ok(body.includes(...))` pattern.
  Has four tests: AC-required prose, observable-outcome instruction, checkbox format
  example, and byte-identical dogfood check (src vs .cycle). No existing test for
  insight-block prohibition or file-artifact framing.

### Existing Patterns to Follow

- **Prompt-content tests** (`tests/defaults/`): `readFile(SRC)` then
  `assert.ok(body.includes("..."))` for substring presence, or `assert.match(body, /regex/)`
  for structural patterns. Dogfood byte-identity check always paired: reads both SRC and
  DOG, calls `Buffer.compare(src, dog) === 0`.
  — `tests/defaults/spec-prompt-ac.test.ts:1-40`,
     `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72`,
     `tests/defaults/review-prompt-spec-ac.test.ts:1-39`

- **Required Sections pattern in spec.md**: The AC requirement was added in cycle 0211
  as a `## Required Sections` block after the template fence (lines 72-80). New
  prohibitions should be added similarly — either extending `## Required Sections` or
  as a new named section before `## Output`.

- **Existing "Nothing else" instruction**: `src/defaults/prompts/spec.md:121` —
  `"Nothing else, no preamble or closing remarks."` This is the existing output-framing
  instruction in the `## Output` section. It is not strong enough to block insight blocks
  (which agents emit *before* the content, as surrounding commentary, not as a closing
  remark).

- **`## Output` section placement**: Always last, at lines 117-122. New prohibitions
  should be inserted **before** `## Output`, not appended after.

### Dependencies & Integration Points

- `src/engine/run-cycle.ts:307` — calls `sanitizeArtifactStdout(r.stdout)` before
  writing to SPEC.md. This is the write path for all artifact steps. The sanitizer does
  not handle `★ Insight` blocks; that is why the prompt fix is needed.
- `src/engine/run-cycle.ts:310-316` — spec post-condition checks byte size only; it does
  not validate content shape.
- `scripts/sync-defaults.mjs` — must be run after editing `src/defaults/prompts/spec.md`
  to propagate to `.cycle/prompts/spec.md`. The dogfood test enforces byte-identity.
- `tests/defaults/spec-prompt-ac.test.ts` — the natural home for new assertion tests
  verifying prohibition language. Adding tests here follows the established pattern
  without creating new test files.

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert/strict`. No external test
  runner.
- **Naming**: `tests/defaults/<prompt-name>-<aspect>.test.ts`
- **Conventions**: `assert.ok(body.includes("exact phrase"))` for key prose; `assert.match`
  for structural patterns. Dogfood check always uses `Buffer.compare`. Tests run via
  `npm test` (auto-builds first via `pretest`).
- **Coverage of change area**: `tests/defaults/spec-prompt-ac.test.ts` covers AC-section
  requirement. No existing test covers insight-block prohibition or file-artifact framing.
  The dogfood byte-identity test will fail if `sync-defaults` is not run after editing.

## Code References

- `src/defaults/prompts/spec.md:117-122` — `## Output` section, current output framing;
  the phrase "Nothing else, no preamble or closing remarks" is the only existing framing
  prohibition
- `src/defaults/prompts/spec.md:72-80` — `## Required Sections` block added in cycle
  0211; insertion point model for new prohibition block
- `src/engine/sanitize-artifact.ts:1-18` — full `sanitizeArtifactStdout` implementation;
  regex coverage does not include `★` or insight block patterns
- `src/engine/run-cycle.ts:306-317` — artifact write path: sanitize → write → spec guard
- `tests/defaults/spec-prompt-ac.test.ts:1-40` — existing spec prompt tests; new
  assertions for this cycle go here
- `scripts/sync-defaults.mjs:100-121` — copy loop with divergence guard; run after prompt
  edit

## Open Questions

1. **Placement of prohibition block**: Should the file-artifact + prohibition instruction
   extend the existing `## Required Sections` block (lines 72-80), be a new named section
   (e.g., `## File Artifact Mode`), or be prepended as a preamble before `## Discover
   Cycle Context First`? Each location has different visibility to an agent reading the
   prompt top-to-bottom.
2. **Prohibited-example inclusion**: SPEC.md AC criterion 5 says a grep for `★` or
   `Insight` must return no matches "in the file's body text (only in prohibited-examples
   if used)". The planner must decide whether to include a prohibited-example block (which
   would require distinguishing example prose from body prose) or simply state the
   prohibition without examples.
3. **New test assertions**: The test file already has a dogfood byte-identity check. The
   planner must specify what exact phrases the new assertion tests should search for — the
   research does not prescribe wording.
```
