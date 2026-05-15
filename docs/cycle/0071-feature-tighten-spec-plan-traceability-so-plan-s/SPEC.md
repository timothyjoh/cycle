Have context. Writing SPEC.

```markdown
# SPEC — Cycle 0071: Require explicit SPEC→PLAN acceptance traceability in plan prompt

## Objective

Close the SPEC→PLAN traceability gap that swallowed one of four required RFC-001 line annotations in cycle 0028. Teach the `plan` step prompt to emit an explicit checklist mapping every SPEC acceptance bullet to a numbered plan task (or to an explicit waiver with rationale), and teach the `review` step prompt to fail-NEEDS-FIX when that checklist is missing or incomplete. Deliver via the prompt-tweak path (issue Direction #1); defer the static verify check (Direction #2) to a sibling cycle.

## Source Issue

`refl-0028-plan-step-silently-dropped-spec-annotati` — "Tighten SPEC→PLAN traceability so plan step cannot silently drop SPEC acceptance bullets"

## Scope

### In Scope

- Extend `src/defaults/prompts/plan.md` (and dogfood mirror `.cycle/prompts/plan.md`) to require a `## SPEC Acceptance Traceability` section in the emitted PLAN.md that enumerates every SPEC `## Acceptance Criteria` bullet verbatim with its covering plan task id, or an explicit `WAIVED — <one-line rationale>`.
- Extend `src/defaults/prompts/review.md` (and dogfood mirror) so that a missing or incomplete traceability section in PLAN.md is a NEEDS-FIX trigger in Pass 1, with the corresponding MUST-FIX task shape.
- Document the convention in `CLAUDE.md` under a new short subsection so future workflow-prompt edits preserve it.
- One regression test under `tests/defaults/` that pins the relevant prompt clauses (byte-equivalence between `src/defaults/prompts/{plan,review}.md` and `.cycle/prompts/{plan,review}.md`, and presence of the new traceability requirement language in both `plan.md` and `review.md`).

### Out of Scope

- Static verify check that mechanically parses SPEC bullets and PLAN tasks (issue Direction #2) — deferred to a sibling cycle once the convention stabilizes.
- Retroactive audit of past `docs/cycle/<id>-feature-*/PLAN.md` artifacts.
- Generalizing the traceability requirement to non-`feature` workflows (issue Out of scope #2).
- Editing the `spec` prompt to standardize bullet-id syntax — the convention is "verbatim re-quote of the bullet text", not a new bullet-id scheme.

## Requirements

- The `plan` prompt change MUST instruct the agent to fail loudly (omit the PLAN entirely or emit only the traceability stub) rather than silently drop a SPEC bullet.
- The `review` prompt change MUST make a missing or incomplete `## SPEC Acceptance Traceability` section in PLAN.md a NEEDS-FIX trigger of equal weight to missing-test or coverage-regression findings.
- The dogfood mirror (`.cycle/prompts/plan.md`, `.cycle/prompts/review.md`) MUST stay byte-identical to `src/defaults/prompts/{plan,review}.md` after `npm run sync-defaults` (existing divergence guard policy; same shape as the Pass-3 pin in `tests/defaults/review-prompt-doc-claim-pass.test.ts`).
- The new regression test MUST fail if either the source prompt or the dogfood mirror loses the traceability clause, mirroring the existing prompt-pinning test pattern.
- No engine code changes. No `run-cycle.ts` / `triage.ts` / `queue.ts` edits. Prompt + doc + test only.

## Acceptance Criteria

- [ ] `src/defaults/prompts/plan.md` carries a clause requiring a `## SPEC Acceptance Traceability` section in emitted PLAN.md that re-quotes every SPEC acceptance bullet verbatim and pairs it with a covering plan task id or an explicit `WAIVED — <rationale>`.
- [ ] `src/defaults/prompts/review.md` Pass 1 carries a clause making a missing or incomplete traceability section in PLAN.md a NEEDS-FIX trigger, with a corresponding MUST-FIX task shape in Output 2.
- [ ] `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` originals after `npm run sync-defaults` runs cleanly (exit 0).
- [ ] `CLAUDE.md` has a short subsection (under existing prompt/architecture context) naming the SPEC→PLAN traceability convention and pointing to the two prompt files as the canonical source.
- [ ] A new test under `tests/defaults/` (e.g., `plan-prompt-spec-traceability.test.ts`) asserts: (a) `src/defaults/prompts/plan.md` contains the traceability clause; (b) `src/defaults/prompts/review.md` Pass 1 contains the traceability NEEDS-FIX clause; (c) `.cycle/prompts/plan.md` and `.cycle/prompts/review.md` byte-equal their source counterparts.
- [ ] `npm test` passes (full suite green, no pre-existing test regressions).
- [ ] `npm run test:coverage` passes the per-file gate; line/branch/function coverage does not regress vs master baseline (≥95% / ≥75% / ≥90%).
- [ ] `npm run typecheck` clean (no new warnings — this cycle is prompt+doc+test only, so this is a no-op smoke check).

## Testing Strategy

- **Framework:** Node native test runner (`node --test`, spec reporter) — same as all existing tests under `tests/defaults/`.
- **New test file:** `tests/defaults/plan-prompt-spec-traceability.test.ts` modeled directly on `tests/defaults/review-prompt-doc-claim-pass.test.ts` (the existing byte-equivalence + clause-presence pin for review Pass 3).
- **Scenarios to cover:**
  1. `plan.md` source contains the literal traceability-clause anchor text (e.g., the section header `## SPEC Acceptance Traceability` and the key requirement phrase the prompt uses to enforce it).
  2. `review.md` source contains the corresponding NEEDS-FIX clause anchor text.
  3. Both dogfood mirrors are byte-identical to their `src/defaults/prompts/` originals (use `fs.readFile` + `Buffer.equals` per the existing pattern).
- **Regression aspect of issue Acceptance #3 ("SPEC with N bullets, PLAN covering N-1 must fail before reaching build"):** in the prompt-tweak path this is enforced *by the review agent reading the prompt*, not by deterministic code. The regression test therefore pins the prompt clauses that make that enforcement possible. A mechanical end-to-end test that drives an agent through a deficient PLAN is deferred with the static-verify-check work (Direction #2).
- **Anti-mock posture:** no mocks; read real files from disk via `fs/promises`, as the existing prompt-pinning tests do.
- **E2E:** none — no UI surface; no engine code path changes.

## Documentation Updates

- **CLAUDE.md:** add a short subsection (1–2 paragraphs) under the existing architecture/prompt context naming the SPEC→PLAN acceptance-traceability convention, why it exists (cycle 0028 incident), and which prompt files are the canonical source. Cross-reference `src/defaults/prompts/plan.md` and `src/defaults/prompts/review.md` by relative path. Mirror-pin policy (sync-defaults byte-identity) should be called out explicitly so future prompt edits remember both files.
- **README.md:** no user-facing change. The cycle changes agent-internal prompts only; consumer CLI surface is unchanged.
- **RFC-001:** out of scope. The issue allows "CLAUDE.md or RFC-001"; pick CLAUDE.md to avoid amending an RFC for an agent-prompt convention.
- **`docs/ARCHITECTURE.md`:** no change required — this cycle does not alter engine architecture, only the agent prompts the engine dispatches. If a "Workflow prompts" subsection already names the prompt files individually, append a one-line pointer to the new CLAUDE.md subsection; otherwise leave untouched.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- Existing `src/defaults/prompts/{plan,review}.md` and their `.cycle/prompts/` mirrors.
- Existing `tests/defaults/review-prompt-doc-claim-pass.test.ts` as the structural template for the new test.
- `npm run sync-defaults` (and its divergence guard) as the mechanism that keeps mirror byte-identity; no behavior change requested from sync-defaults itself.
- No new external services, no new env vars, no new npm dependencies.
```
