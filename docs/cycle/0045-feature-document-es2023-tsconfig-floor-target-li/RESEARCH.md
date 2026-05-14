Enough context. Write research doc to stdout.

```markdown
# Research: Cycle 0045

## Cycle Context
SPEC.md asks for a docs-only change that retroactively documents cycle 0019's silent bump of `tsconfig.json` (`target: ES2022 → ES2023`, `lib: ["ES2023"]` added). Two deliverables: (1) one new bullet under `## Runtime` in `CLAUDE.md` immediately after the existing `Node ≥ 22.6` line that names ES2023 as the *floor* and links to the new RFC; (2) a new `docs/RFC-002-typescript-es2023-floor.md` with Context / Decision / Consequences sections that cite cycle 0019's `BUILD.md` and `REVIEW.md` as the trigger. Both files must cross-link. No source / test / config files change; `tsconfig.json` stays byte-identical.

## Current Codebase State

### Relevant Components
- `CLAUDE.md` Runtime section — the insertion target — `CLAUDE.md:11-14`. Existing block is two bullets (`Node ≥ 22.6 …`, `If node --version returns < 22 …`); the new line per SPEC sits between them or immediately under the first bullet.
- `tsconfig.json` — settled at `target: "ES2023"` / `lib: ["ES2023"]` — `tsconfig.json:3-4`. Must stay byte-identical per SPEC § Acceptance Criteria.
- `docs/RFC-001-issue-lifecycle.md` — only existing RFC, defines the naming + section conventions that RFC-002 should mirror — `docs/RFC-001-issue-lifecycle.md:1-3` (header `# RFC-001: …`, status line `**Status:** Accepted (YYYY-MM-DD)…`, scope line). RFC-001 uses numbered `## 1. Motivation`, `## 2. Folder layout`, etc.; it is not strictly Context/Decision/Consequences-shaped, so RFC-002 will set the precedent for that shorter shape.
- Cycle 0019 trigger artifacts (must remain reachable from RFC-002):
  - `docs/cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md:3` — records the deviation: `tsconfig.json (+1 line lib: ["ES2023"], target bumped to ES2023)`, justification `pre-existing findLast errors in tests/cli/multi-loop.test.ts:53,114`.
  - `docs/cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REVIEW.md:15` — frames it as `Scope creep (acceptable, doc-noted)`, calls out `tsconfig.json:3-4`.
- Issue file `docs/cycle/issues/todo/refl-0019-tsconfig-es2023-bump-needs-formal-decisi.md:1-46` — the source ask; supplies draft phrasing for the CLAUDE.md bullet (lines 24-27) that the SPEC paraphrases.
- ES2023-only API usage in repo (proof that the floor is load-bearing):
  - `tests/cli/multi-loop.test.ts:53` and `tests/cli/multi-loop.test.ts:114` — both call `events.findLast(...)`. These are the only direct ES2023-array-method call sites; no other `.findLast(`, `.findLastIndex(`, `.toSorted(`, `.toReversed(` calls exist anywhere under `src/` or `tests/` (only string occurrences are in comments / prompt files).

### Existing Patterns to Follow
- **RFC file naming**: `docs/RFC-NNN-<kebab-slug>.md` — established by `docs/RFC-001-issue-lifecycle.md`. SPEC names RFC-002 explicitly: `docs/RFC-002-typescript-es2023-floor.md`.
- **RFC header shape**: line 1 `# RFC-NNN: <Title>`; line 3 `**Status:** Accepted (YYYY-MM-DD).` plus optional supersedes/scope clause; horizontal rule `---` between sections. See `docs/RFC-001-issue-lifecycle.md:1-6`.
- **README index of RFCs**: `README.md:133` already lists RFC-001 as `[docs/RFC-001-issue-lifecycle.md](docs/RFC-001-issue-lifecycle.md) — accepted issue lifecycle, triage, queue, and blocked-work semantics.` SPEC does not require a README update (calls README out of scope), but the existing index entry is the precedent if planner decides to add one.
- **CLAUDE.md bullet style under section headings**: `## Runtime` currently uses two prose bullets with backticks for identifiers (`Node ≥ 22.6`, `~/.nvm/...`). The new bullet should match that voice.
- **Cross-document links**: relative paths from repo root, e.g. `[docs/RFC-001-issue-lifecycle.md](docs/RFC-001-issue-lifecycle.md)` (from `README.md`). From `CLAUDE.md` at repo root, the link is `docs/RFC-002-typescript-es2023-floor.md`. From `docs/RFC-002-*.md`, links back to `CLAUDE.md` use `../CLAUDE.md`; links to cycle 0019 artifacts use `cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md` and `.../REVIEW.md`.

### Dependencies & Integration Points
- `CLAUDE.md` is read by every contributor (agent or human) at session start; the new bullet is the single discoverable surface for the runtime/typecheck floor decision.
- `docs/RFC-001-issue-lifecycle.md` is the existing precedent for documented-decision artifacts under `docs/`. No `docs/adr/` directory exists in the repo (`ls docs/adr` → `No such file or directory`), confirming SPEC's note that RFC is the project convention.
- `tsconfig.json:3-4` is the implementation that RFC-002 documents; nothing else in the repo enforces or duplicates the `target`/`lib` setting (no separate `babel.config`, no CI step that re-reads them).
- `npm run typecheck` (= `tsc --noEmit`) is what would fail if `lib`/`target` were downgraded — this is the practical guard the RFC's Consequences section references. Today's `findLast` callers at `tests/cli/multi-loop.test.ts:53,114` would re-fail without the ES2023 lib.

### Test Infrastructure
- Test framework: Node's native test runner (`node --test`), spec reporter, invoked via `npm test`. See `CLAUDE.md:20`.
- Coverage: `npm run test:coverage` using `--experimental-test-coverage`. Baseline floors documented at `CLAUDE.md:31-34` (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- Test layout: `tests/<area>/<name>.test.ts`. Tests run TypeScript directly via `--experimental-strip-types` (Node ≥ 22.6).
- Current coverage of the change area: not measurable — both deliverables are pure documentation files (`CLAUDE.md`, `docs/RFC-002-…md`). No `src/` line moves; coverage delta is expected to be `0.00` per file.
- This cycle adds no test code (SPEC § Testing Strategy: "Docs-only cycle; no new test code required").

## Code References
- `CLAUDE.md:11-14` — `## Runtime` block, insertion site for the new ES2023-floor bullet.
- `CLAUDE.md:31-34` — coverage baselines that the `build`/`fix` steps will enforce; numbers should stay flat for a docs-only change.
- `tsconfig.json:3-4` — `"target": "ES2023"`, `"lib": ["ES2023"]` — the settings RFC-002 documents.
- `docs/RFC-001-issue-lifecycle.md:1-6` — header / status / scope shape RFC-002 follows.
- `docs/RFC-001-issue-lifecycle.md:391-432` — illustrates how RFC-001 references cycle ids (e.g. `cycle 0014`, `cycle 0018`, `cycle 0021`); RFC-002 will reference cycle 0019 the same way.
- `docs/cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md:3` — full text of cycle 0019's "deviation" paragraph (`tsconfig.json (+1 line lib: ["ES2023"], target bumped to ES2023)` … "pre-existing findLast errors in tests/cli/multi-loop.test.ts:53,114"). Direct source for RFC-002's Context section.
- `docs/cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REVIEW.md:15` — REVIEW item #1 (`Scope creep (acceptable, doc-noted): tsconfig.json was bumped target: ES2022 → ES2023 and lib: ["ES2023"] added — … tsconfig.json:3-4 … No action needed.`). Second direct source for the Context section.
- `tests/cli/multi-loop.test.ts:53` and `:114` — the two `events.findLast(...)` call sites that prove the lib floor is load-bearing today.
- `docs/cycle/issues/todo/refl-0019-tsconfig-es2023-bump-needs-formal-decisi.md:24-36` — issue-level draft phrasing for both the CLAUDE.md bullet and the RFC sections; SPEC paraphrases but doesn't supersede this.
- `README.md:133` — existing precedent for indexing RFCs from README; out of scope per SPEC, included for planner awareness only.

## Open Questions
- **`SPEC.md` fences itself in ```markdown … ```.** `docs/cycle/0045-feature-document-es2023-tsconfig-floor-target-li/SPEC.md` opens line 1 with a literal ` ```markdown ` line and closes on line 60 with ` ``` `, wrapping the entire spec body in a code fence. The Acceptance Criteria, Requirements, etc. are *inside* the code block. This is unusual vs. earlier cycle SPECs (e.g. 0019's `SPEC.md` is not fenced); planner should confirm whether this affects how downstream steps (build / review / verify) read the spec — and decide whether unwrapping is in or out of scope for this cycle. Recommended: leave SPEC as-is (mutating prior cycle artifacts is not a deliverable here).
- **Exact wording / structural choice for the CLAUDE.md bullet.** SPEC § Requirements paraphrases the floor message; the issue body at lines 24-27 supplies a candidate sentence. Planner picks final phrasing within those constraints (must say "floor", must list at least the indicative ES2023 APIs, must link to RFC-002).
- **RFC-002 section depth.** SPEC requires Context / Decision / Consequences. RFC-001's existing template is numbered (`## 1.`, `## 2.`) and longer-form. Planner decides whether RFC-002 mirrors RFC-001's numbering or uses bare `## Context` / `## Decision` / `## Consequences` headings. SPEC does not constrain; the issue's "Required sections" line implies bare headings.
- **Whether `README.md`'s RFC index gets a parallel `RFC-002` entry.** SPEC § Documentation Updates explicitly says "README.md: No change." → defer; do not add. Flagging because the existing RFC-001 entry at `README.md:133` is the obvious sibling and a future cycle may want it.
- **Status date for RFC-002.** Today's date is `2026-05-14` per session context. Planner should confirm before stamping (the RFC-001 convention is `Accepted (YYYY-MM-DD)`).
```
