I have all the context. Writing the research document now.

```markdown
# Research: Cycle 0141

## Cycle Context

Cycle 0141 delivers a documentation discipline improvement: edit `src/defaults/prompts/spec.md` to add a named "Validator and parser refactor precedence" subsection with two accepted resolution modes (Parity and Carve-out), plus a self-check instruction that catches the ambiguous phrase "same order of checks" when used without explicit enumeration or carve-out declaration. After the edit, `npm run sync-defaults` keeps the dogfood copy in sync. The change is forward-looking spec hygiene — preventing future refactors of validators/parsers from silently reordering reject-path precedence without deliberate acknowledgment.

## Current Codebase State

### Relevant Components

- **Spec prompt template (source of truth)**: `src/defaults/prompts/spec.md:1-113` — The prompt consumed by the `spec` workflow step. Contains sections: Discover Cycle Context First, Write the Spec (with an inline markdown template), Cycle Sizing, Vertical Slices Only, UI & Design Standards, Output. No feasibility self-check, no validator/parser precedence section, no "same order of checks" guard. Last modified in cycle 0012 (commit `65822b0`).

- **Spec prompt (dogfood copy)**: `.cycle/prompts/spec.md` — Byte-identical to `src/defaults/prompts/spec.md` as of research time. Both files are in sync; no divergence conflict exists.

- **Sync-defaults script**: `scripts/sync-defaults.mjs:1-135` — Copies every file under `src/defaults/` to `.cycle/`, guarded by sha256 divergence detection. Writes state to `.cycle/.sync-state.json`. Run via `npm run sync-defaults`. Must be run after any edit to `src/defaults/prompts/spec.md`.

- **RFC-001**: `docs/RFC-001-issue-lifecycle.md` — Documents issue lifecycle, triage, queue drain, blocked propagation, resume, and reflection. No prompt-authoring guidance or validator/parser precedence conventions. Issue AC explicitly scoped the change to spec.md (not RFC-001).

### Existing Patterns to Follow

- **Prompt regression test pattern**: `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72` — Every prompt discipline rule added to a prompt file is pinned by a corresponding regression test in `tests/defaults/`. Pattern:
  - `import { test } from "node:test"` + `import { strict as assert } from "node:assert"` + `import { readFile } from "node:fs/promises"`
  - Read `src/defaults/prompts/<name>.md` and assert specific phrases/regexes exist
  - Include a dogfood byte-identical assertion comparing `src/defaults/prompts/<name>.md` vs `.cycle/prompts/<name>.md`
  - No mocking — reads actual files from disk

- **Phrase-presence assertion**: `assert.ok(body.includes("...phrase..."), "descriptive failure message")` — `tests/defaults/verify-prompt-spec-ac.test.ts:8-13`, `tests/defaults/plan-prompt-spec-traceability.test.ts:15-21`

- **Section-header assertion via regex**: `assert.match(body, /^## Section Name$/m)` — `tests/defaults/review-prompt-doc-claim-pass.test.ts:8-11`

- **Dogfood byte-identical assertion**: `assert.equal(Buffer.compare(src, dog), 0, "... — run npm run sync-defaults")` — `tests/defaults/verify-prompt-spec-ac.test.ts:16-23`, `tests/defaults/plan-prompt-spec-traceability.test.ts:57-63`

- **Spec prompt SPEC.md template structure**: `src/defaults/prompts/spec.md:26-70` — The inline markdown template block uses `##` headers (Objective, Source Issue, Scope, Requirements, Acceptance Criteria, Testing Strategy, Documentation Updates, Dependencies). New subsections should use a heading level and placement consistent with this structure.

### Dependencies & Integration Points

- `src/defaults/prompts/spec.md` → (sync) → `.cycle/prompts/spec.md` — synced by `scripts/sync-defaults.mjs`
- `scripts/sync-defaults.mjs` → `.cycle/.sync-state.json` — records sha256 pairs; must remain consistent after the edit
- `npm run sync-defaults` — defined in `package.json`, runs `sync-defaults.mjs`
- `tests/defaults/` regression tests — read `src/defaults/prompts/spec.md` and `.cycle/prompts/spec.md` directly; byte-identical dogfood assertion will fail if sync-defaults is not run after editing

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert` (`strict`), no external test runner
- **Test conventions**: Files under `tests/defaults/` cover prompt content rules. One test file per prompt rule cluster. File naming: `<prompt-name>-<rule-description>.test.ts`
- **Execution**: `npm test` (runs `pretest` build first), or `npm run test:coverage` for LCOV
- **No mocks** for prompt content tests — reads files from disk paths relative to repo root
- **Coverage floor**: `scripts/sync-defaults.mjs` has a 90% floor (`scripts/coverage-gate.mjs` FLOORS table); new test file does not add a new floor entry unless it contains branch-heavy logic

### Paired Issue Status

- `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` is in `docs/cycle/issues/done/` — however, no "feasibility" text exists anywhere in `src/defaults/prompts/spec.md` or `.cycle/prompts/spec.md`. The issue being in `done/` does not mean the text landed. The planner must not assume a feasibility self-check section already exists in spec.md.

## Code References

- `src/defaults/prompts/spec.md:1-113` — Full spec prompt; no validator/precedence content
- `src/defaults/prompts/spec.md:26-70` — Inline SPEC.md markdown template with `##`-level sections
- `src/defaults/prompts/spec.md:72-113` — Cycle sizing, vertical-slices, UI & Design, Output instructions
- `.cycle/prompts/spec.md` — Dogfood copy; byte-identical to source as of research
- `scripts/sync-defaults.mjs:100-134` — Copy loop + divergence guard + state write
- `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72` — Canonical pattern for prompt discipline tests
- `tests/defaults/verify-prompt-spec-ac.test.ts:1-23` — Shorter example of phrase-presence + dogfood pattern
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-42` — Section-header regex pattern example

## Open Questions

- **Where in spec.md to insert the new subsection**: The issue says "a named subsection" but does not specify whether it belongs inside the SPEC.md template block (so spec writers see it as a template section to fill in), or outside the template as authoring instructions (alongside Cycle Sizing, Vertical Slices Only). The planner should decide which placement better serves the authoring agent.
- **Self-check placement**: The issue calls for a self-check that catches "same order of checks" phrasing — this could be phrased as an instruction in the self-check checklist inside the prompt, or as a negative example in the subsection body. The planner should decide the most actionable form.
- **New test file name**: Convention suggests `tests/defaults/spec-prompt-validator-precedence.test.ts`; confirm this fits the naming pattern.
- **Coverage floor**: No new floor entry needed unless the new test file introduces branch-heavy logic — but planner should confirm whether coverage-gate.mjs needs an update.
```
