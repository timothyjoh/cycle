Have enough context. Outputting RESEARCH.md.

```markdown
# Research: Cycle 0071

## Cycle Context

SPEC asks: extend `src/defaults/prompts/plan.md` and `src/defaults/prompts/review.md` (plus their dogfood mirrors under `.cycle/prompts/`) so PLAN.md must emit a `## SPEC Acceptance Traceability` section enumerating every SPEC acceptance bullet verbatim with a covering plan task id (or `WAIVED — <rationale>`), and so the review step's Pass 1 fails NEEDS-FIX when that section is missing/incomplete. Document the convention in `CLAUDE.md`. Add one regression test under `tests/defaults/` mirroring the existing Pass-3 prompt pin. No engine code changes.

## Current Codebase State

### Relevant Components

- Plan prompt (source): `src/defaults/prompts/plan.md:1-113`. Currently structures the plan output template at `:45-97` (markdown fenced section starting `# Implementation Plan: Cycle <cycle_id>`), with task scaffold (`## Task 1: [Descriptive Name]`, `### Success Criteria`) and a closing `## Testing Strategy` + `## Risk Assessment`. The "Important Guidelines" block at `:99-113` enumerates 9 numbered rules; no rule today mentions SPEC acceptance traceability.
- Plan prompt (dogfood mirror): `.cycle/prompts/plan.md` — byte-identical to source (verified `diff` returns no output). Synced via `npm run sync-defaults`.
- Review prompt (source): `src/defaults/prompts/review.md:1-205`. Pass 1 lives at `:25-44` (`## Pass 1: Code Quality Review` with checklist incl. "Spec compliance — does the code deliver what SPEC.md requires?" at `:36-37` and "Plan adherence — were PLAN.md tasks completed as specified?" at `:38-39`). Pass 2 at `:46-64`. Pass 3 at `:66-96`. Review output template (`REVIEW.md` scaffold) at `:98-149`; the verdict line at `:106-107` lists NEEDS-FIX triggers ("code-quality findings, missing tests, coverage regressions, missing SPEC requirements, OR any unbacked doc-vs-code claim from Pass 3"). MUST-FIX.md template at `:151-192`.
- Review prompt (dogfood mirror): `.cycle/prompts/review.md` — byte-identical to source (verified `diff` returns no output).
- CLAUDE.md prompt/architecture context: `CLAUDE.md:60-81` is the `## Architecture quick reference` block — the existing prose anchor for prompt conventions. The most recent precedent is the `Review step Pass 3:` bullet at `:81` which names the prompt file path and the pinning test file path. No SPEC→PLAN traceability bullet exists today.
- Sync mechanism: `scripts/sync-defaults.mjs` (referenced at `CLAUDE.md:26-47`). Copies `src/defaults/*` → `.cycle/*` and records sha256 pairs in `.cycle/.sync-state.json`. Divergence guard refuses to overwrite locally-divergent destinations (exit 2) unless `--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1`. `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` are not in the divergent set (the only canonical divergent file is `.cycle/workflows.yml`).

### Existing Patterns to Follow

- **Prompt pinning regression test pattern.** `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-42` is the structural template SPEC names. Five tests, each a single `test(...)` call:
  - `:8-11` — `assert.match(body, /^## Pass 3: Doc-vs-Code Claim Verification$/m)` pins the source section header.
  - `:13-16` — pins the output-template heading in `REVIEW.md` scaffold.
  - `:18-25` — iterates an allow-list of doc paths the prompt must mention; also asserts the `docs/cycle/*` exclusion clause via regex disjunction.
  - `:27-33` — pins the literal sentinel string `"No documentation prose changed; pass skipped."`.
  - `:35-42` — byte-equivalence pin: `readFile(SRC)` + `readFile(DOG)` + `Buffer.compare(src, dog) === 0`.
  - Imports: `node:test` + `node:assert` (strict) + `node:fs/promises`. Top-of-file constants `SRC` and `DOG`. No setup/teardown; pure read-from-disk.
- **Verbatim section-header anchoring.** Existing Pass-3 pin uses `^## Pass 3: ...$/m` regex against a known header. Same shape applies to a `## SPEC Acceptance Traceability` anchor.
- **CLAUDE.md architecture-block convention.** Each bullet at `CLAUDE.md:62-81` opens with a Title-Case label terminated by colon (e.g., `Review step Pass 3:`, `Retry skip policy (pre-build only):`), then prose with backticked file paths and the pinning-test path called out by name. New bullet for SPEC→PLAN traceability should follow this shape and be added inside the same `## Architecture quick reference` section, adjacent to the Pass-3 bullet for topical proximity.
- **Existing prompt-pinning tests directory.** `tests/defaults/` (10 test files; see `ls` output above). The new test file name SPEC suggests is `plan-prompt-spec-traceability.test.ts`, consistent with the kebab-case-of-concern naming used by siblings (e.g., `pr-restart-tolerance.test.ts`, `sync-defaults-guard.test.ts`).

### Dependencies & Integration Points

- `npm run sync-defaults` (`scripts/sync-defaults.mjs`) is the mechanism that keeps `.cycle/prompts/{plan,review}.md` in lock-step with `src/defaults/prompts/{plan,review}.md`. Editing the source without running sync-defaults will leave the mirror stale and the new byte-equivalence test will fail. After source edits, run `npm run sync-defaults` (no `--force` needed; the two prompt files are not in the locally-divergent set).
- The `plan` workflow step is dispatched by the engine through `src/engine/run-cycle.ts` and resolved to the `claudecode` agent via `resolveAgent` in `src/engine/exec.ts`. The engine reads the prompt template file path from `workflows.yml > feature.steps[plan]`. This cycle does NOT modify those engine paths.
- The `review` step's NEEDS-FIX → MUST-FIX.md → `fix` step flow is already operational (verified in cycle 0070 reflection, where review correctly raised three critical findings that the fix step addressed). The traceability check joins that existing flow; no new code path needed.
- `CLAUDE.md` lines 78 / 81 (per skill memory checkpoint S474) carry prose that the existing Pass-3 reviewer would now also verify against under the doc-vs-code claim pass. The new CLAUDE.md subsection will need to be `file:line`-backed by the new prompt clauses to satisfy that same Pass 3 in this very cycle's review.

### Test Infrastructure

- **Framework:** Node native test runner (`node --test`, spec reporter via `--test-reporter=spec`). Configured indirectly: `npm test` (per `CLAUDE.md:21`) runs the suite with auto-build via `pretest`.
- **Conventions:** `import { test } from "node:test"`; `import { strict as assert } from "node:assert"`; file naming `<concern>.test.ts`; pure file-read tests under `tests/defaults/` use `node:fs/promises` and run with no setup state (anti-mock posture).
- **Coverage gate:** `npm run test:coverage` runs `--experimental-test-coverage` with the per-file gate `src/engine/triage.ts ≥ 95%` enforced by `scripts/coverage-gate.mjs`. SPEC notes this cycle is prompt+doc+test only, so per-file gate triage.ts is unaffected; the global line/branch/function baseline (95%/75%/90%) must not regress.
- **Coverage of the change area:** `src/defaults/prompts/` files are static `.md` resources, not source code — they have no coverage instrumentation. The new `tests/defaults/plan-prompt-spec-traceability.test.ts` exercises the prompt files via `readFile` only; its own code is excluded from coverage by the `tests/` exclusion at `CLAUDE.md:21`.

## Code References

- `src/defaults/prompts/plan.md:1-113` — Plan-step prompt; SPEC-extended target. The output template fenced markdown at `:45-97` is where a `## SPEC Acceptance Traceability` section requirement would naturally append, ahead of `## Testing Strategy` at `:86`. The "Important Guidelines" enumerated list at `:99-113` is where a discipline rule reinforcing the new requirement would slot in (current count: 9 rules; new one would be `10.`).
- `src/defaults/prompts/review.md:25-44` — Pass 1 checklist; SPEC asks for a new NEEDS-FIX trigger here ("SPEC→PLAN traceability section missing or incomplete in PLAN.md").
- `src/defaults/prompts/review.md:106-111` — REVIEW.md output template "Overall Verdict" NEEDS-FIX trigger list; new trigger string should be appended to keep the verdict prose in sync.
- `src/defaults/prompts/review.md:151-192` — MUST-FIX.md output template; SPEC asks for "a corresponding MUST-FIX task shape" — the existing generic Task shape at `:172-178` is reusable, but a named shape ("Missing SPEC→PLAN Traceability") parallel to the Unbacked Doc Claim shape at `:182-191` would mirror the Pass-3 precedent.
- `.cycle/prompts/plan.md` / `.cycle/prompts/review.md` — dogfood mirrors; byte-identical to source today, must remain byte-identical after sync-defaults runs.
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-42` — structural template for the new test.
- `CLAUDE.md:60-81` — `## Architecture quick reference` block; SPEC asks for a new short subsection here naming the SPEC→PLAN traceability convention and pointing to `src/defaults/prompts/plan.md` and `src/defaults/prompts/review.md` as canonical source. Sibling bullet at `:81` (Pass 3) is the most direct precedent.
- `scripts/sync-defaults.mjs:1-60` — sync mechanism + divergence guard; no behavior change requested.
- `docs/cycle/0028-feature-rfc-001-promote-issue-folder-spec-to-rfc/SPEC.md` (origin incident referenced by source issue at `docs/cycle/issues/todo/refl-0028-plan-step-silently-dropped-spec-annotati.md:11`) — historical context only; not edited this cycle.

## Open Questions

- **Exact anchor wording for the traceability section header in PLAN.md.** SPEC specifies `## SPEC Acceptance Traceability` (line 18). Confirming this is the literal string the new test should regex-match in both prompts (vs. a softer phrase like `acceptance traceability` case-insensitive). Plan step will lock the precise anchor string.
- **Whether the "Important Guidelines" numbered list at `plan.md:99-113` should grow a 10th rule for traceability discipline, or whether the new clause should live only inside the output template.** Either supports the SPEC requirement; plan step chooses one (or both) for clarity and tests against the chosen anchor(s).
- **Whether the new MUST-FIX shape in `review.md` should be a fully separate named template parallel to the Unbacked Doc Claim shape (`:182-191`) or reuse the generic Task shape with a fixed `**Priority: Critical**` and `**Files: PLAN.md**`.** SPEC says "with a corresponding MUST-FIX task shape" — does not mandate a named template. Plan step decides; either satisfies SPEC Acceptance bullet #2.
- **Whether the new CLAUDE.md subsection should be a new sub-heading (e.g., `### SPEC→PLAN traceability`) under `## Architecture quick reference`, or a single bullet appended after the Pass-3 bullet at `:81`.** SPEC says "short subsection (1–2 paragraphs)"; sibling bullets at `:62-81` are all flat list items, so a new bullet item is the lower-friction precedent, but a true sub-heading would mark this as a documented convention vs. an architecture note. Plan step decides.
```
