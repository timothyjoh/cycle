Plan inputs read. Two open questions worth resolving in plan: bullet wording, RFC section headers. Writing plan.

```markdown
# Implementation Plan: Cycle 0045

## Overview
Docs-only cycle. Add one bullet to `CLAUDE.md` `## Runtime` naming ES2023 as the TypeScript floor and create `docs/RFC-002-typescript-es2023-floor.md` with Context / Decision / Consequences sections that cite cycle 0019's BUILD.md and REVIEW.md as the trigger. Both files cross-link.

## Current State (from Research)
- `tsconfig.json:3-4` already pins `target: "ES2023"` / `lib: ["ES2023"]` (set in cycle 0019 as undocumented scope creep).
- `CLAUDE.md:11-14` `## Runtime` section has two bullets (`Node ≥ 22.6 …`, nvm fallback). No mention of the TypeScript lib floor.
- `docs/RFC-001-issue-lifecycle.md` is the only existing RFC. Header shape: `# RFC-NNN: <Title>` / `**Status:** Accepted (YYYY-MM-DD)` / `---` separators. RFC-001 uses numbered `## 1. Motivation` style; SPEC explicitly asks for Context / Decision / Consequences for RFC-002, so RFC-002 sets the precedent for bare-heading short RFCs.
- Load-bearing ES2023 call sites: `tests/cli/multi-loop.test.ts:53` and `:114` (both `events.findLast(...)`). Only direct ES2023-array-method callers in the repo.
- No `docs/adr/` directory exists; RFC is the project's documented-decision convention.

## Desired End State
- `CLAUDE.md` `## Runtime` section gains one new bullet directly below the `Node ≥ 22.6` bullet stating ES2023 is the floor for `target`/`lib` and linking to `docs/RFC-002-typescript-es2023-floor.md`.
- `docs/RFC-002-typescript-es2023-floor.md` exists, follows RFC-001's header/status convention, has three sections (`## Context`, `## Decision`, `## Consequences`), references cycle 0019's BUILD.md and REVIEW.md, links back to `../CLAUDE.md`.
- `tsconfig.json` byte-identical. No file under `src/`, `tests/`, `dist/`, `scripts/`, `.cycle/` touched.
- `npm test` → 342/342. `npm run typecheck` → no warnings. `npm run test:coverage` → flat vs baseline.

Verification: `git status` shows exactly two changed paths (`CLAUDE.md` modified, `docs/RFC-002-typescript-es2023-floor.md` new). `grep -n "RFC-002" CLAUDE.md` returns one match. `grep -n "CLAUDE.md" docs/RFC-002-typescript-es2023-floor.md` returns one match. Open both files and confirm relative links resolve.

## What We're NOT Doing
- NOT editing `tsconfig.json` (settled in cycle 0019; stays byte-identical).
- NOT editing anything under `src/`, `tests/`, `dist/`, `scripts/`, `.cycle/`.
- NOT updating `README.md` (SPEC explicitly out-of-scope; future cycle may add a parallel RFC-002 index entry).
- NOT creating `docs/adr/` (RFC is the project convention; SPEC says extend it).
- NOT adding a CI guard for the lib floor (separate future issue, SPEC out-of-scope).
- NOT unwrapping cycle 0045's SPEC.md from its outer ```markdown fence (mutating a prior step's artifact is not a deliverable; planner-resolved per RESEARCH open question).
- NOT adding new tests (docs-only; no `src/` change means no coverage delta).

## Implementation Approach
Two-file change, sequenced so the RFC exists before `CLAUDE.md` links to it (avoids a brief window where the link is dangling on disk during partial edits). Both files reference each other; we author RFC-002 first with the back-link to `../CLAUDE.md` (the bullet's anchor doesn't matter since `CLAUDE.md` has no slug anchors; bare path is fine), then add the forward-link in `CLAUDE.md`. Resolutions to RESEARCH open questions are baked into the tasks below:

- **Bullet wording**: explicit "floor" framing, names representative ES2023 APIs (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`), single sentence, one relative link.
- **RFC-002 section depth**: bare `## Context` / `## Decision` / `## Consequences` (matches SPEC requirement names verbatim; RFC-001's numbered style is fine for longer RFCs, but SPEC's explicit section names favor bare headings here).
- **Status date**: `Accepted (2026-05-14)` (today's date per session context).
- **Cross-link form**: from `CLAUDE.md` → `docs/RFC-002-typescript-es2023-floor.md` (no `./` prefix; matches `README.md:133`'s precedent). From `docs/RFC-002-…md` → `../CLAUDE.md` and `cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/{BUILD,REVIEW}.md`.

---

## Task 1: Create `docs/RFC-002-typescript-es2023-floor.md`

### Overview
Author the new RFC with Context / Decision / Consequences sections, citing cycle 0019 artifacts as the trigger and `CLAUDE.md` as the discovery surface.

### Changes Required
**File**: `docs/RFC-002-typescript-es2023-floor.md` (new)

**Content shape** (final wording can adjust within these constraints; section names must be exact):

```markdown
# RFC-002: TypeScript ES2023 floor

**Status:** Accepted (2026-05-14). Scope: contributor-facing project conventions (typecheck floor); no user-facing API change.

---

## Context

Cycle 0019 ([BUILD.md](cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md), [REVIEW.md](cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REVIEW.md)) bumped `tsconfig.json` from `target: ES2022` (no `lib`) to `target: ES2023` / `lib: ["ES2023"]` to resolve pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`. The bump was flagged as "scope creep (acceptable, doc-noted)" in cycle 0019's REVIEW but never formalized as a project decision, so the next contributor reaching for an ES2023 method (or considering downgrading `lib`) has no single rationale to consult.

## Decision

The project's TypeScript floor is **ES2023** for both `target` and `lib` in `tsconfig.json`. ES2023 array prototypes (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`) and ES2023 grammar (Hashbang) are first-class and require no polyfills. Node 22.6 — already the runtime floor (see [../CLAUDE.md](../CLAUDE.md) `## Runtime`) — natively implements all ES2023 features, so the typecheck floor matches the runtime floor.

## Consequences

- The Node 22.6 floor is now load-bearing for *type-checking*, not just runtime. Downgrading `lib` below ES2023 requires either a coordinated Node downgrade or polyfills.
- Future ES2023+ stdlib usage (`Array.prototype.toSorted`, `Object.groupBy`, etc.) needs no further decision — add and ship.
- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`).
- This RFC is the canonical citation when reviewing PRs that propose touching `tsconfig.json` `target` or `lib`.
```

### Success Criteria
- [ ] File exists at the exact path `docs/RFC-002-typescript-es2023-floor.md`.
- [ ] Has exactly three top-level sections named `## Context`, `## Decision`, `## Consequences` (in that order).
- [ ] Header line 1 is `# RFC-002: TypeScript ES2023 floor`; status line uses `**Status:** Accepted (2026-05-14)`.
- [ ] References `tests/cli/multi-loop.test.ts:53,114` (proves the floor is load-bearing today).
- [ ] Contains at least two relative links: one to `cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md` and one to `cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REVIEW.md`.
- [ ] Contains a relative link `../CLAUDE.md` (back-link).
- [ ] `npm test` → 342/342. `npm run typecheck` → clean.

---

## Task 2: Add the ES2023-floor bullet to `CLAUDE.md`

### Overview
Insert one new bullet immediately under the existing `Node ≥ 22.6` bullet in `## Runtime`, linking to RFC-002.

### Changes Required
**File**: `CLAUDE.md`

**Edit target**: insert immediately after the existing first bullet of `## Runtime` (`CLAUDE.md:13`), before the `If node --version returns < 22 …` bullet.

**Old**:
```
- Node ≥ 22.6 (uses `--experimental-strip-types` to run TypeScript sources directly; no transpile step in tests).
- If `node --version` returns < 22, prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH or run `nvm use 22.22.2`.
```

**New**:
```
- Node ≥ 22.6 (uses `--experimental-strip-types` to run TypeScript sources directly; no transpile step in tests).
- TypeScript floor is **ES2023** (`target`/`lib` in `tsconfig.json`). ES2023 array methods (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`) and Hashbang grammar are usable without polyfills. Rationale: [docs/RFC-002-typescript-es2023-floor.md](docs/RFC-002-typescript-es2023-floor.md).
- If `node --version` returns < 22, prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH or run `nvm use 22.22.2`.
```

### Success Criteria
- [ ] `CLAUDE.md` contains the new bullet between the `Node ≥ 22.6` line and the `nvm` line.
- [ ] `grep -n "RFC-002" CLAUDE.md` returns exactly one match (the new bullet).
- [ ] Link target is the bare path `docs/RFC-002-typescript-es2023-floor.md` (no `./`, no anchor).
- [ ] No other line in `CLAUDE.md` is modified (diff is one inserted bullet only).
- [ ] `npm test` → 342/342. `npm run typecheck` → clean. `npm run test:coverage` → flat.

---

## Testing Strategy

### Unit Tests
- None added. Docs-only cycle; no `src/` line moves so no coverage delta is possible.
- No mocking decisions to make.

### Integration / E2E Tests
- `npm test` (full suite, 342/342) — must remain green; this is the regression gate that the new bullet didn't accidentally land inside a fenced block of `CLAUDE.md` that some other tool parses (none currently does, but the suite is the proof).
- `npm run typecheck` — must remain clean; pure docs change, so any regression here is a sign the edit corrupted something unrelated.
- `npm run test:coverage` — line/branch/function counts must stay at-or-above the documented baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%). Expected delta: 0.00 across the board.

### Manual verification
- Open `CLAUDE.md` and click through the RFC-002 link in a markdown previewer (or `cat docs/RFC-002-typescript-es2023-floor.md`) — confirm resolves.
- Open `docs/RFC-002-typescript-es2023-floor.md` and confirm `../CLAUDE.md`, `cycle/0019-…/BUILD.md`, and `cycle/0019-…/REVIEW.md` all resolve relative to the RFC file's location.
- `git diff --stat` — expect exactly: `CLAUDE.md | 1 +` and `docs/RFC-002-typescript-es2023-floor.md | NN ++++` (creation).

## Risk Assessment
- **Risk**: `CLAUDE.md` is read by the agent harness at session start; a malformed bullet could change how future agents interpret the Runtime section. **Mitigation**: keep the bullet to the same prose-with-backticks style as the existing two; no headings, no tables, no fenced blocks added inside the bullet.
- **Risk**: relative links in the new RFC reference cycle 0019 artifacts; if a future cleanup moves cycle artifact directories, these break. **Mitigation**: accept — git history is authoritative per SPEC, and the cycle 0019 directory has been stable since merge; a future move would warrant updating RFC-002 alongside.
- **Risk**: `npm run test:coverage` is noisy on environments with different Node patch versions and could spuriously flag a regression. **Mitigation**: the docs-only change cannot affect coverage; if numbers move, the failure is pre-existing and the cycle reflection should flag it rather than this cycle bearing the fix.
- **Risk**: SPEC.md is itself wrapped in a ```markdown fence (RESEARCH open question). **Mitigation**: leave it alone — mutating a prior step's artifact is not a deliverable, and downstream steps (build/review/verify) treat SPEC.md as text input, not as code to execute.
```
