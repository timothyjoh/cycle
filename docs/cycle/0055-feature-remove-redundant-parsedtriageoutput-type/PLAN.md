Cycle 0055 confirmed. Three rename sites in `src/engine/triage.ts:65,68,76`. Resolved scope-ambiguity open question below. Writing plan now.

```markdown
# Implementation Plan: Cycle 0055

## Overview
Collapse the redundant in-file alias `ParsedTriageOutput` into the canonical `TriageOutput` in `src/engine/triage.ts`. Pure type-only rename across three sites in a single file; zero runtime change; verified by `tsc --noEmit` + the existing 381-test suite + the `triage.ts ≥ 95% line` per-file coverage floor.

## Current State (from Research)
- `TriageOutput` is the canonical declaration at `src/engine/triage.ts:51-55`.
- `type ParsedTriageOutput = TriageOutput;` at `src/engine/triage.ts:65` is the redundant alias.
- Two in-file usages of the alias remain:
  - `src/engine/triage.ts:68` — `RawAttemptOutcome` union, `parsed: ParsedTriageOutput`.
  - `src/engine/triage.ts:76` — `ProcessCtx.apply?: (raw: RawIssue, parsed: ParsedTriageOutput) => Promise<void>`.
- Other in-file sites (`src/engine/triage.ts:368`, `:560`) already use `TriageOutput` directly — they consume / produce the same structural shape, so the rename is structurally a no-op for them.
- Both names are non-exported (file-private). Nothing outside `src/engine/triage.ts` imports either identifier. Confirmed by `rg -n "ParsedTriageOutput\|TriageOutput"` returning empty in `tests/` and only the three in-file matches in `src/`.
- The downstream call chain that joins the two names today: `validateOutput` (`triage.ts:368`) returns `{ ok: true; parsed: TriageOutput } | …`. Its `parsed` is forwarded into `ctx.apply` (whose param is currently typed `ParsedTriageOutput`) and into the `RawAttemptOutcome` arm (also currently typed `ParsedTriageOutput`). Because both names resolve to the same structural type today, the renamed sites continue to compile against the unchanged producers/consumers.

## Desired End State
- `src/engine/triage.ts` contains exactly one declaration of `TriageOutput` at the original line and **no** `ParsedTriageOutput` identifier.
- `rg -n "ParsedTriageOutput" src tests` returns no matches.
- `npm run typecheck` clean. `npm test` 381/381. `npm run test:coverage` reports `src/engine/triage.ts` line coverage ≥ 95% with no regression vs the master baseline (was 99.72% per cycle 0054). Aggregate coverage stays ≥ 95% line / ≥ 75% branch / ≥ 90% function.
- No test file is touched (tests reference neither name; they exercise behavior via `runTriage` / `dryRunTriage` / `validateOutput` exports).
- No runtime artifact differs: `dist/cycle.js` bytes may differ by the removed identifier name in source maps only; the executable JS is unchanged because TypeScript types are erased.

## What We're NOT Doing
- **Not splitting** `TriageOutput` into a `Raw` vs validated pair (option 2 from the source issue). SPEC §Scope rejects this — the three current sites carry no parse-vs-validated semantic distinction.
- **Not editing historical cycle artifacts** that reference `ParsedTriageOutput`:
  - `docs/cycle/0023-feature-cycle-triage-dry-run-test-triage-prompt/{PLAN,REVIEW,REFLECTION}.md`
  - `docs/cycle/0015-*/PLAN.md`
  - `docs/cycle/0055-feature-remove-redundant-parsedtriageoutput-type/{SPEC,RESEARCH}.md` (this cycle's own inputs)
  - `docs/cycle/issues/todo/refl-0023-parsedtriageoutput-is-a-redundant-type-a.md` (the source issue — its title names the alias on purpose)
  - `docs/cycle/issues/done/refl-0023-parsedtriageoutput-is-a-redundant-type-a_raw.md` (archived raw)
  These are immutable post-cycle records and the source-of-truth pointer for the work being done. SPEC §Acceptance line 30 ("repo-wide zero matches") is reconciled in favor of SPEC §Requirements line 22 ("`rg -n "ParsedTriageOutput" src tests` returns zero") — see Resolved Open Questions below.
- **Not touching any other type alias** in `triage.ts` (`TriageAgentResult`, `TriageChild`, `RawIssue`, `RawAttemptOutcome`, `Frontmatter`, `CycleConfig`, `ProcessCtx`, `DryRunReport`, …) or in any other file.
- **Not renaming the source issue file**, **not moving it out of `issues/todo/`** — that happens only when the cycle ends successfully via the normal `cycle.end` drain.
- **Not editing `README.md`, `CLAUDE.md`, `BRIEF.md`, `docs/RFC-*`, `docs/ARCHITECTURE.md`** — none of these currently reference `ParsedTriageOutput` (verified via `rg`), and SPEC §Documentation explicitly waives doc updates.
- **Not adding new tests.** A type-only rename of an erased alias has no runtime behavior to test; the typechecker is the semantic guard. Adding a test would couple to an internal identifier name.

## Implementation Approach
One file, three lexical changes, sequenced in a single edit. The rename is mechanically applied via `Edit replace_all` on the literal identifier `ParsedTriageOutput` and then a follow-up `Edit` to delete the now-orphan `type ParsedTriageOutput = TriageOutput;` line. Verification is performed via the existing tooling chain (`typecheck` → `test:coverage` → `check:coverage` via the auto-run `posttest:coverage` hook → repo-scope `rg`).

The change is staged as a single vertical slice because there is no smaller meaningful unit — the typechecker rejects any intermediate state where the alias is deleted but a use site is unchanged. Both edits land in one logical step; verification follows.

## Resolved Open Questions

**Q1 (from RESEARCH §Open Questions): Scope of post-rename `rg -n "ParsedTriageOutput"` check.**
Resolved: **code-only scope (`src tests`)**, matching SPEC §Requirements line 22. SPEC §Acceptance line 30 is treated as informal shorthand for the same scope. Rationale:
- Cycle artifacts under `docs/cycle/<id>-*/` are by convention immutable post-cycle (they are the historical record of what each cycle did).
- The source issue (`docs/cycle/issues/todo/refl-0023-parsedtriageoutput-is-a-redundant-type-a.md`) necessarily names the alias in its title; rewriting it would erase the traceability pointer to the work being done in this cycle.
- This cycle's own SPEC.md and RESEARCH.md must continue to reference the name in order to describe what they describe.
- Expanding scope to "scrub the entire repo" would inflate a 4-line diff into a ~10-file churn touching closed cycles, with no engineering value (the historical references are factual statements about what those cycles found, not live code).

**Q2 (from RESEARCH §Open Questions): Treatment of the source issue file itself.**
Resolved: exempt regardless. Covered by Q1's "code-only scope" decision automatically (the issue file lives outside `src tests`).

---

## Task 1: Rename `ParsedTriageOutput` → `TriageOutput` and delete the alias declaration

### Overview
Replace the two remaining alias use sites with the canonical name, then delete the alias declaration. Both edits happen in `src/engine/triage.ts`. No other file changes.

### Changes Required

**File**: `src/engine/triage.ts`

**Change 1 — line 68 (inside `RawAttemptOutcome` union):**
```ts
type RawAttemptOutcome =
  | { status: "ok"; parsed: ParsedTriageOutput; attempts: number }
  | { status: "failed"; lastError: string; attempts: number };
```
becomes
```ts
type RawAttemptOutcome =
  | { status: "ok"; parsed: TriageOutput; attempts: number }
  | { status: "failed"; lastError: string; attempts: number };
```

**Change 2 — line 76 (inside `ProcessCtx`):**
```ts
  apply?: (raw: RawIssue, parsed: ParsedTriageOutput) => Promise<void>;
```
becomes
```ts
  apply?: (raw: RawIssue, parsed: TriageOutput) => Promise<void>;
```

**Change 3 — delete line 65 (and the surrounding blank-line discipline):**
Remove the entire line `type ParsedTriageOutput = TriageOutput;`. After deletion the block `type RawIssue = { … }; \n\n type ParsedTriageOutput = TriageOutput; \n\n type RawAttemptOutcome = …` collapses to `type RawIssue = { … }; \n\n type RawAttemptOutcome = …` — exactly one blank line between `RawIssue` and `RawAttemptOutcome`, matching the spacing convention used between every other top-of-file type declaration in this file.

**Suggested edit mechanic (one efficient sequence):**
1. `Edit` with `old_string: "type ParsedTriageOutput = TriageOutput;\n\n"` and `new_string: ""` (deletes the alias line plus its trailing blank line in one stroke).
2. `Edit` with `replace_all: true` on `old_string: "ParsedTriageOutput"` and `new_string: "TriageOutput"` (covers both remaining use sites). Because step 1 already removed the alias declaration, step 2 cannot accidentally re-introduce a `type TriageOutput = TriageOutput;` collision.

(Order matters: deleting the declaration line first means the `replace_all` in step 2 has no chance of generating a self-referential `type TriageOutput = TriageOutput;` line.)

### Success Criteria
- [ ] `rg -n "ParsedTriageOutput" src tests` → 0 matches.
- [ ] `rg -n "^type TriageOutput =" src/engine/triage.ts` → exactly 1 match (the original declaration at line 51, now relatively closer to the top of the type block by 2 lines).
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] `npm test` reports 381 passing, 0 failing.
- [ ] `npm run test:coverage` completes; its auto-run `posttest:coverage` (which invokes `scripts/coverage-gate.mjs`) exits 0 — the `src/engine/triage.ts ≥ 95% line` floor still holds.
- [ ] No tests added, no tests modified — `git diff --stat tests/` is empty.
- [ ] `git diff --stat src/` shows exactly one file changed (`src/engine/triage.ts`) with a net `-4` lines (delete: 1 alias line + 1 blank, modify in place: 2 lines unchanged in count → net `-2`; conservative target is `-2` to `-4` depending on whitespace collapse).
- [ ] No file in `README.md`, `CLAUDE.md`, `BRIEF.md`, `docs/RFC-*.md`, `docs/ARCHITECTURE.md` was modified. (Doc-update waiver from SPEC §Documentation, and pre-rename `rg` confirmed none of these reference the alias.)

---

## Testing Strategy

### Unit Tests
- **No new tests.** Type-only rename of an erased alias has no runtime surface; the typechecker is the semantic guard. Adding a test would couple to an internal type name (anti-pattern called out in the cycle's RESEARCH §Test Infrastructure).
- The existing `tests/engine/triage*.test.ts` files (suite includes `triage.test.ts`, `triage.faults.test.ts`, `triage-validator.test.ts`, `triage-dry-run.test.ts`) all exercise the public behavioral surface (`runTriage`, `dryRunTriage`, `validateOutput`, `runAgent`) and never reference the internal type names — they continue to act as the regression net unchanged.

### Integration / E2E Tests
- The existing 381-test suite covers triage end-to-end (validation pipeline, retry budget, queue mutations, dry-run report). Coverage gate (`scripts/coverage-gate.mjs`) enforces `src/engine/triage.ts ≥ 95% line` and runs automatically via `posttest:coverage`.

### Anti-Mock Position
- The change is below the test surface. Existing tests use real filesystem operations and a stubbed `runAgent` injection (no global mock infrastructure). Nothing in this cycle changes that posture.

## Risk Assessment

- **Risk: a stale tooling cache (TypeScript incremental, `dist/cycle.js`) hides a missed rename site.**
  Mitigation: `npm test` runs `pretest` which invokes `node scripts/build.mjs` — a fresh esbuild bundle each test run. `npm run typecheck` runs `tsc --noEmit` directly, no incremental cache configured (`tsconfig.json` does not set `incremental: true`). Combined with the `rg -n "ParsedTriageOutput" src tests → 0 matches` gate, no rename site can be missed without one of these gates failing.

- **Risk: an external dependency (consumer of `triage.ts`) imports `ParsedTriageOutput`.**
  Mitigation: confirmed by `rg` at research time — both names are non-exported; nothing outside the file can import either. The `export` discipline in this file is enforced lexically (only `DryRunReport` and the function exports carry `export`); both `TriageOutput` and `ParsedTriageOutput` are bare `type` declarations.

- **Risk: the SPEC §Acceptance line 30 ("repo-wide zero matches") is interpreted strictly by a downstream reviewer, who blocks the cycle on the historical-doc references.**
  Mitigation: this PLAN explicitly resolves the contradiction in favor of SPEC §Requirements line 22 (code-only scope), documents the rationale, and enumerates every historical reference left intact under "What We're NOT Doing." The build step's doc-grep at SPEC §Documentation line 45 (which lists `README.md`, `CLAUDE.md`, `BRIEF.md`, `docs/**/*.md`) is satisfied by the natural scope: those specific files contain zero `ParsedTriageOutput` references today, and the rename touches none of them, so the grep stays at zero for that set. The build step should be advised (in BUILD.md) that `docs/cycle/**/` is excluded from the doc-grep — those are historical cycle artifacts, not "documentation" in the SPEC §Documentation sense.

- **Risk: coverage regression from the line deletion shifting branch identities in the LCOV report.**
  Mitigation: `coverage-gate.mjs` measures per-file *line* coverage as a percentage; deleting a non-executable type declaration removes a single non-covered line from the denominator. The per-file ratio can only stay the same or improve. Aggregate metrics are stable for the same reason (one fewer counted line in one file out of many).
```

★ Insight ─────────────────────────────────────
- The "code-only scope" call (Q1) is the load-bearing planning decision — without it, this 4-line diff would balloon into a multi-file historical-doc rewrite that violates the immutability-of-cycle-artifacts convention. The plan calls this out explicitly so build step doesn't redo the analysis.
- Edit ordering matters here: delete the alias line *before* `replace_all` on the identifier, otherwise the `replace_all` rewrites the alias's RHS first and produces the self-referential `type TriageOutput = TriageOutput;` collision. Cheap to avoid, expensive to debug.
- Per-file line coverage can only stay the same or improve when deleting a non-executable type declaration — the denominator drops by one un-counted line. The gate is structurally safe under this kind of edit.
─────────────────────────────────────────────────

Plan written to stdout for capture into PLAN.md.
