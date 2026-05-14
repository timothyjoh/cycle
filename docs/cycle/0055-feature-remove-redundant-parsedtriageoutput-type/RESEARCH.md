```markdown
# Research: Cycle 0055

## Cycle Context
SPEC.md asks for a single-file structural rename: replace every reference to the non-exported `ParsedTriageOutput` alias in `src/engine/triage.ts` with `TriageOutput`, then delete the alias declaration. Both names point to the same structural type today; only `TriageOutput` remains. Pure erased-type change — no runtime path, no tests touched, verified by `tsc --noEmit` + existing 381-test suite + per-file coverage floor.

## Current Codebase State

### Relevant Components
- `TriageOutput` canonical type declaration (one of two names today): `src/engine/triage.ts:51-55`. Object with `ordering: string[]`, `children: TriageChild[]`, `decomposed_parents: string[]`.
- `ParsedTriageOutput` alias being removed: `src/engine/triage.ts:65` — `type ParsedTriageOutput = TriageOutput;`.
- Use site 1 (alias): `src/engine/triage.ts:68` — inside discriminated union `RawAttemptOutcome`, `parsed: ParsedTriageOutput` arm of `status: "ok"`.
- Use site 2 (alias): `src/engine/triage.ts:76` — inside `ProcessCtx` interface, `apply?: (raw: RawIssue, parsed: ParsedTriageOutput) => Promise<void>`.
- Pre-existing `TriageOutput` use sites (not touched by this cycle, listed so the planner knows they already match the canonical name): `src/engine/triage.ts:368` (`validateOutput` return type `{ ok: true; parsed: TriageOutput } | …`), `src/engine/triage.ts:560` (`applyRaw` parameter `parsed: TriageOutput`).
- Both types are file-private (no `export`); nothing outside `src/engine/triage.ts` can reference either name.

### Existing Patterns to Follow
- File-private type aliases live near the top of `src/engine/triage.ts` (lines 21-86 group all type declarations before the implementation). The remaining single declaration of `TriageOutput` will continue to follow that grouping.
- The rest of the file already uses `TriageOutput` directly at two sites (lines 368, 560) without an alias — the rename brings the inconsistent sites into line with the existing pattern, no new pattern introduced.
- Type identifiers in this file are PascalCase, non-exported types are bare `type` aliases (not `export type`). Consistent across `TriageAgentResult`, `TriageChild`, `RawIssue`, `RawAttemptOutcome`, etc.
- Subprocess discipline, frontmatter parsing, queue mutation patterns documented in CLAUDE.md are not relevant here — change is purely lexical at the TypeScript level.

### Dependencies & Integration Points
- Importers of `triage.ts`: `src/cli.ts`, `tests/engine/triage*.test.ts` (multiple), `src/engine/run-cycle.ts` indirectly via the engine boot path. None of these import `ParsedTriageOutput` or `TriageOutput` — both are non-exported, so renaming is contained to the single file. Verified by `rg -n "ParsedTriageOutput"` and `rg -n "TriageOutput"`: matches outside `src/engine/triage.ts` are only inside historical docs (`docs/cycle/0023-*/PLAN.md`, `0023-*/REVIEW.md`, `0023-*/REFLECTION.md`, `docs/cycle/0015-*/PLAN.md`, `issues/{todo,done}/refl-0023-*.md`) and the current cycle's own SPEC.md — historical artifacts, not editable code references.
- Build path: `npm run build` (esbuild bundle) compiles `src/cli.ts → dist/cycle.js`. Type erasure makes the rename a no-op for the emitted bundle once TypeScript stripping runs.
- Typecheck path: `npm run typecheck` (`tsc --noEmit`) is the semantic guard — will fail if any of the three rename sites is missed.

### Test Infrastructure
- Test framework: Node's native `node:test` runner with the spec reporter, run via `npm test` (auto-builds `dist/` first via `pretest`).
- Test conventions: `tests/engine/*.test.ts`, paired one-test-file-per-source-file plus topic-specific files (e.g., `triage.test.ts`, `triage.faults.test.ts`, `triage-validator.test.ts`, `triage-dry-run.test.ts`).
- Coverage of the change area: `src/engine/triage.ts` is under a per-file ≥ 95% line floor enforced by `scripts/coverage-gate.mjs`. Current run reports 99.72% line per CLAUDE.md note for cycle 0054.
- Tests reference neither `ParsedTriageOutput` nor `TriageOutput` (confirmed by `grep -rn "ParsedTriageOutput\|TriageOutput" tests/` → empty). Tests interact with `runTriage`, `validateOutput`, `dryRunTriage`, `runAgent` via public exports / behavior, not via internal type names — no test edits required.

## Code References
- `src/engine/triage.ts:51-55` — `TriageOutput` canonical type definition (kept).
- `src/engine/triage.ts:65` — `type ParsedTriageOutput = TriageOutput;` line to delete.
- `src/engine/triage.ts:67-69` — `RawAttemptOutcome` union; line 68 changes `ParsedTriageOutput` → `TriageOutput`.
- `src/engine/triage.ts:71-78` — `ProcessCtx` interface; line 76 changes `ParsedTriageOutput` → `TriageOutput`.
- `src/engine/triage.ts:368` — `validateOutput` already returns `{ ok: true; parsed: TriageOutput } | { ok: false; reason: string }`. Site flows `validation.parsed: TriageOutput` into the `ProcessCtx.apply` callback at `triage.ts:143` and into the `RawAttemptOutcome` arm at `triage.ts:151` — both will accept the renamed type unchanged because they already resolve to the same structural shape.
- `src/engine/triage.ts:560` — `applyRaw(repoRoot, raw, parsed: TriageOutput)` already uses the canonical name; consumer of the `ctx.apply` callback at `triage.ts:198` wraps `applyRaw` and passes `parsed: TriageOutput`. After rename, the callback signature and the wrapped fn signature match by identifier, not just structure.
- `scripts/coverage-gate.mjs` — enforces `src/engine/triage.ts ≥ 95% line`. No coverage-shape change expected from a type-only rename.
- `tsconfig.json` — ES2023 target, `--noEmit` mode via `npm run typecheck`. Type-only declarations are erased; rename is invisible to runtime.
- Historical docs (`docs/cycle/0023-*/PLAN.md:54`, `docs/cycle/0023-*/REVIEW.md:48`, `docs/cycle/0023-*/REFLECTION.md`, `docs/cycle/0015-*/PLAN.md:125`, `docs/cycle/issues/{todo,done}/refl-0023-*.md`) reference `ParsedTriageOutput` as historical record. SPEC §Acceptance constrains the post-rename `rg` check to repo-wide zero matches; the planner must decide whether SPEC's "across the repo returns no matches" intends a strict zero (would force touching historical issue + plan + review + reflection artifacts) or a code-only zero (`src tests`). See Open Questions.

## Open Questions
- **Scope of post-rename `rg -n "ParsedTriageOutput"` check.** SPEC §Requirements line 22 specifies `rg -n "ParsedTriageOutput" src tests` (code-only zero, which is naturally satisfied by the three-site edit). SPEC §Acceptance line 30 specifies `rg -n "ParsedTriageOutput"` across the repo returns no matches (would require editing historical SPEC/PLAN/REVIEW/REFLECTION artifacts under `docs/cycle/0023-*/` and `docs/cycle/0015-*/` plus the issue files under `docs/cycle/issues/{todo,done}/refl-0023-*.md`). Historical cycle artifacts are typically immutable post-cycle. The planner needs to reconcile the two checks: either treat the §Acceptance bullet as informal shorthand for the §Requirements `src tests` scope, or expand scope to scrub historical docs (incurring a much larger diff and a documentation-immutability question). The plan step must pick one.
- **`refl-0023-parsedtriageoutput-is-a-redundant-type-a.md` itself** (the source issue): its title and body necessarily reference `ParsedTriageOutput`. Even under the broadest reading of the §Acceptance check, deleting the identifier from the issue that names it would erase the source-of-truth pointer. The planner should explicitly call out that this file is exempted regardless of scope choice (or convert §Acceptance to the §Requirements scope to avoid the contradiction).
```
