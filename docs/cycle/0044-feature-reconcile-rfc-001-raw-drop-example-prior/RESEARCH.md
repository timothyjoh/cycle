Have everything needed. Emitting research doc.

```markdown
# Research: Cycle 0044

## Cycle Context
This cycle is a doc-only edit. The file `docs/RFC-001-issue-lifecycle.md` §"Raw drop" shows an illustrative frontmatter example with `priority: 5`, while the canonical writer `materializeFreeformIssue` (behind `cycle drop`) emits `priority: 3` as the default (legal range 1–10, enforced in the CLI parser). The SPEC requires changing the example value from `5` to `3` and appending a one-line note that states the legal range (1–10), the default (`3`), and points at the writer (`materializeFreeformIssue` / `cycle drop`). No other file in the repo may be modified.

## Current Codebase State

### Relevant Components
- RFC document being edited: `docs/RFC-001-issue-lifecycle.md` (430 lines total). The §"Raw drop" heading is at `docs/RFC-001-issue-lifecycle.md:41`. The fenced YAML example block starts at `docs/RFC-001-issue-lifecycle.md:45` and closes at `docs/RFC-001-issue-lifecycle.md:55`. The line that must change is `docs/RFC-001-issue-lifecycle.md:52` (`priority: 5           # optional hint to triage; not honored automatically`). The fenced block ends at line 53 (` ``` `); the new one-line note must sit immediately after line 53 (before the next `### Triaged todo` heading at line 57, with a blank line separating the note from line 53 per the surrounding pattern).
- Canonical writer (the implementation the note must reference): `src/issue/materialize.ts:5` exports `materializeFreeformIssue(text, repoRoot, now, priority = 3)`. The default `priority = 3` is the function-parameter default at `src/issue/materialize.ts:9`. The frontmatter line emitted is `src/issue/materialize.ts:22` (`` `priority: ${priority}` ``).
- CLI surface that calls the writer: `src/cli/parse-args.ts` handles `cycle drop`. Default `priority = 3` at `src/cli/parse-args.ts:39`. Range validation (1..10 inclusive, integer) at `src/cli/parse-args.ts:40-48`. The validation/usage error text at `src/cli/parse-args.ts:32` and `:45` confirms both the range and the default that the RFC note will state.

### Existing Patterns to Follow
- Inline notes in this RFC: the file already uses prose paragraphs after fenced code blocks (e.g. lines 35, 43, 59) rather than blockquotes. Match that style — a single plain prose line after the example block, not a blockquote — unless the SPEC explicitly required a blockquote (it does not; it just says "one-line note ... immediately after the example block").
- The fenced YAML example block in §"Raw drop" uses inline `#` comments to annotate fields (`docs/RFC-001-issue-lifecycle.md:48`, `:51`, `:52`). The SPEC scope says "the smallest change that satisfies the above; surrounding paragraphs, headings, and example fields other than `priority:` are untouched" — so all other commented fields stay as-is. Only the `5` on line 52 changes to `3`; the trailing `# optional hint to triage; not honored automatically` comment is not in scope to alter and per SPEC stays untouched.
- Cross-references to source files in this RFC use backticked paths without line numbers (e.g. `src/engine/...` style). The note should reference `materializeFreeformIssue` and `cycle drop` in backticks; an explicit `src/issue/materialize.ts` path is consistent with the issue-file Option (b) wording but is not required by the SPEC. (SPEC requires only that the note "references `materializeFreeformIssue` / `cycle drop`".)
- The SPEC explicitly forbids any other structural reorganization (no new section, no glossary) — the change must remain a single-line addition.

### Dependencies & Integration Points
- The number `3` and the range `1–10` appear in three places that all must already agree (and do):
  - `src/issue/materialize.ts:9` — default value (`= 3`)
  - `src/cli/parse-args.ts:39` — CLI default (`let priority = 3`)
  - `src/cli/parse-args.ts:32`, `:45` — CLI usage strings ("integer 1..10, default 3" / "must be an integer 1..10")
  These three sources are the ground truth the new RFC note must match. No code change is needed to align them; they already match the wording the note will introduce.
- The RFC currently mentions `priority` in two other places (informational only, **not in scope to edit**):
  - `docs/RFC-001-issue-lifecycle.md:231` — describes `tbd.jsonl` as "priority-ordered queue" (a different concept; not about the `priority:` frontmatter field).
  - `docs/RFC-001-issue-lifecycle.md:320` — `"priority_hint": 7` inside a triage JSON example (a triage-output schema field, not the raw-drop default).
  Per SPEC §"Out of Scope", neither of these is touched.

### Test Infrastructure
- Test framework: Node's native test runner (`node --test`), invoked via `npm test` (auto-builds `dist/cycle.js` first via `pretest`).
- Test conventions: tests live under `tests/` (e.g. `tests/issue/materialize.test.ts` per session memory). The cycle 0042 work already added priority-flag coverage; existing assertions pin the `priority: 3` default and the 1–10 range in `tests/issue/materialize.test.ts` and CLI parse-args tests (verified via S423 reflection context).
- Current coverage of the change area: not applicable — this cycle does not touch any `src/` file, so `src/issue/materialize.ts` coverage is unchanged. SPEC acceptance criteria explicitly require coverage baselines to hold (line ≥ 95%, branch ≥ 75%, func ≥ 90%) by virtue of the change being doc-only.

## Code References
- `docs/RFC-001-issue-lifecycle.md:41` — §"Raw drop" heading (anchor for the edit).
- `docs/RFC-001-issue-lifecycle.md:45` — opening fence ` ```yaml ` of the example block.
- `docs/RFC-001-issue-lifecycle.md:52` — the literal line `priority: 5           # optional hint to triage; not honored automatically` — only the `5` token changes to `3`; rest of the line is untouched per SPEC.
- `docs/RFC-001-issue-lifecycle.md:53` — closing fence ` ``` ` of the example block. The new one-line note is inserted immediately after this line (with a blank line before it to match surrounding paragraph spacing — see lines 35 and 43 for the pattern).
- `src/issue/materialize.ts:9` — `priority: number = 3` (the function default the note will reference).
- `src/issue/materialize.ts:22` — `` `priority: ${priority}` `` (the emitted frontmatter line the example mirrors).
- `src/cli/parse-args.ts:32` — usage string: `cycle drop "<text>" [--priority N]; N is an integer 1..10, default 3`.
- `src/cli/parse-args.ts:39` — CLI default `let priority = 3`.
- `src/cli/parse-args.ts:40-48` — integer + range (1..10) validation for `--priority`.
- `docs/cycle/issues/todo/refl-0019-rfc-001-raw-drop-example-priority-mismat.md:21-26` — Option (a) wording the SPEC adopts ("recommended for clarity").

## Open Questions
- Exact prose of the one-line note: the SPEC mandates three facts (range 1–10, default `3`, writer is `materializeFreeformIssue` / `cycle drop`) but leaves the surface wording to the plan step. The issue file's Option (a) draft (`priority is an integer in the inclusive range 1–10; 3 is the default emitted by cycle drop when --priority is not given.`) is the recommended template; the plan step should decide whether to use it verbatim or tighten it, and whether to include the explicit function name `materializeFreeformIssue` inline or only `cycle drop` (SPEC says "`materializeFreeformIssue` (and/or the `cycle drop` CLI surface)", i.e. either or both).
- Blockquote vs. plain prose for the note: the issue file's Option (a) shows a `>` blockquote; the surrounding RFC paragraphs after fenced examples are plain prose (lines 35, 43, 59). The plan step should pick one and justify it briefly; default recommendation based on existing pattern is plain prose, but a blockquote is also legal under the SPEC wording.
- Whether the trailing inline comment `# optional hint to triage; not honored automatically` on line 52 should be preserved verbatim: SPEC §"Requirements" says "surrounding paragraphs, headings, and example fields other than `priority:` are untouched" — read literally, only the value `5` → `3` changes and the comment stays. The plan step should confirm this read before editing.
```
