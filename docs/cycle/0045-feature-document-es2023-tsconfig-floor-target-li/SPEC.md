```markdown
# SPEC — Cycle 0045: Document ES2023 tsconfig floor in CLAUDE.md + RFC-002

## Objective
Turn cycle 0019's silent `tsconfig.json` bump (`target`/`lib` → `ES2023`) into a documented project-level decision. Add a one-liner in `CLAUDE.md`'s Runtime section and a new short RFC under `docs/` that records context, decision, and consequences, so the next contributor who reaches for an ES2023 array method (or considers downgrading the lib floor) has a single, linkable rationale instead of having to re-litigate it from cycle history.

## Source Issue
`refl-0019-tsconfig-es2023-bump-needs-formal-decisi` — "Document ES2023 tsconfig floor (target/lib) in CLAUDE.md + ADR"

## Scope

### In Scope
- One-line addition under the existing `Node ≥ 22.6` bullet in `CLAUDE.md` → `## Runtime`, naming ES2023 as the floor and linking to the new RFC.
- New `docs/RFC-002-typescript-es2023-floor.md` with Context / Decision / Consequences sections, referencing cycle 0019's `BUILD.md` and `REVIEW.md` as the trigger.

### Out of Scope
- Any change to `tsconfig.json` (current `target: ES2023` / `lib: ["ES2023"]` stays as-is).
- Any change under `src/`, `tests/`, `dist/`, or `scripts/`.
- A CI check that pins the lib floor (separate future issue).
- Creating a `docs/adr/` directory — the project's existing documented-decision convention is RFC (see `docs/RFC-001-issue-lifecycle.md`), so we extend that convention rather than introducing a parallel one.

## Requirements
- **CLAUDE.md Runtime bullet** must:
  - Sit immediately under the existing `Node ≥ 22.6` line so the runtime/typecheck floor are visually adjacent.
  - State explicitly that ES2023 is the *floor* (not aspirational), so `findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`, and Hashbang grammar are usable without polyfills.
  - Include a relative link to `docs/RFC-002-typescript-es2023-floor.md` for the rationale.
- **RFC-002** must:
  - Follow the file-naming pattern of `docs/RFC-001-issue-lifecycle.md`.
  - **Context** — note cycle 0019's `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114` and that the bump was flagged out-of-scope in cycle 0019's `BUILD.md` / `REVIEW.md`.
  - **Decision** — bump `tsconfig.json` `target` and `lib` to `ES2023`; Node 22.6 runtime floor (already documented) makes this safe at runtime.
  - **Consequences** — Node 22.6 floor is now load-bearing for *type-checking*, not just runtime; downgrading `lib` requires either a Node downgrade or polyfills; future ES2023+ APIs (`Array.prototype.toSorted`, `Object.groupBy`, etc.) need no further decision.
- Both files must reference each other so a reader can navigate either direction in one hop.
- No new dependencies, no scripts, no engine changes.

## Acceptance Criteria
- [ ] `CLAUDE.md` Runtime section contains the new ES2023-floor bullet directly under `Node ≥ 22.6`, with a working relative link to `docs/RFC-002-typescript-es2023-floor.md`.
- [ ] `docs/RFC-002-typescript-es2023-floor.md` exists with Context, Decision, Consequences sections, references cycle 0019's BUILD.md and REVIEW.md, and links back to the relevant `CLAUDE.md` line.
- [ ] `tsconfig.json` is byte-identical to its pre-cycle state.
- [ ] No files under `src/`, `tests/`, `dist/`, `scripts/`, or `.cycle/` are modified.
- [ ] `npm test` passes (342/342, no regressions).
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` shows no decrease vs. the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) — expected to be unchanged since no source files move.

## Testing Strategy
- Docs-only cycle; no new test code required.
- Verification = run the full suite (`npm test`) and typecheck (`npm run typecheck`) to confirm zero collateral damage from touching `CLAUDE.md`.
- Manually verify both new cross-links resolve (relative paths) by reading the rendered files.
- Coverage run (`npm run test:coverage`) executes as part of the build/fix gates per `CLAUDE.md`; numbers should be flat.

## Documentation Updates
- **CLAUDE.md**: One new bullet in `## Runtime` documenting the ES2023 typecheck floor with a link to RFC-002. This is the primary deliverable.
- **docs/RFC-002-typescript-es2023-floor.md**: New file — the decision record itself.
- **README.md**: No change. The TypeScript floor is contributor-facing, not user-facing; users only need Node ≥ 22.6 (already covered).
- **AGENTS.md**: Not present in repo; no update needed.

## Dependencies
- `docs/RFC-001-issue-lifecycle.md` already exists and establishes the RFC convention/file-naming pattern — RFC-002 follows it.
- Cycle 0019's `docs/cycle/0019-*/BUILD.md` and `REVIEW.md` must still be present on master to be referenced; they are (git history is the canonical record).
- No external services, no env vars, no new npm packages.
```
