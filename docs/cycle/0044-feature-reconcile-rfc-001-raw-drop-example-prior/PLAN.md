```markdown
# Implementation Plan: Cycle 0044

## Overview
One doc-only edit to `docs/RFC-001-issue-lifecycle.md` §"Raw drop": flip the example `priority` value from `5` to `3` and append one prose line stating the legal range, the actual default, and the writer.

## Current State (from Research)
- §"Raw drop" heading at `docs/RFC-001-issue-lifecycle.md:41`. YAML example block: `:45`–`:53`. Line `:52` reads `priority: 5           # optional hint to triage; not honored automatically`.
- Canonical writer `materializeFreeformIssue(text, repoRoot, now, priority = 3)` at `src/issue/materialize.ts:5`; default at `:9`; emitted line at `:22`.
- CLI default + range at `src/cli/parse-args.ts:32` (usage `"integer 1..10, default 3"`), `:39` (`let priority = 3`), `:40-48` (range validation).
- Surrounding-paragraph pattern in this RFC after fenced examples is plain prose (lines 35, 43, 59) — not blockquote.
- Three other places that mention `priority` in this RFC (`:231` "priority-ordered queue"; `:320` `"priority_hint": 7` in triage example; the §"Triaged todo" example at `:57`) are explicitly out of scope.

## Desired End State
- `docs/RFC-001-issue-lifecycle.md:52` reads `priority: 3           # optional hint to triage; not honored automatically` (only the `5` token changes; trailing comment verbatim).
- A single blank line follows the closing fence (`:53`), then one plain prose line stating: legal range `1–10` inclusive, default `3` emitted by `cycle drop` when `--priority` not given, writer is `materializeFreeformIssue`. The `### Triaged todo` heading (currently `:57`) shifts down by 2 lines but is otherwise unchanged.
- `git diff --stat` shows exactly one file changed (`docs/RFC-001-issue-lifecycle.md`).
- `npm test`, `npm run typecheck`, and `npm run test:coverage` all pass with coverage baselines unchanged (line ≥ 95%, branch ≥ 75%, func ≥ 90%).

## What We're NOT Doing
- NOT changing `materializeFreeformIssue`'s default value or range.
- NOT changing any code, test, workflow YAML, prompt, or script.
- NOT editing the §"Triaged todo" example, the §"Failed" example, or the triage JSON example at `:320`.
- NOT adding a separate "RFC examples vs. defaults" section, glossary, or any new heading.
- NOT rewording the trailing inline comment `# optional hint to triage; not honored automatically` on line 52.
- NOT switching the new note to a blockquote — plain prose only, to match existing RFC pattern (lines 35, 43, 59).
- NOT cross-checking unrelated RFC sections for similar default/example mismatches; that is out of scope per SPEC.

## Implementation Approach
Single vertical slice. The deliverable IS a doc edit, so "implementation" and "verification" collapse to: make the edit, eyeball the rendered section, run the standard sanity gates (`npm test`, `npm run typecheck`, `npm run test:coverage`, `git diff --stat`).

Open-question resolutions (locked in for this plan, no further deferral):
1. **Prose vs. blockquote** → plain prose. Justification: existing RFC pattern after fenced examples is plain prose (lines 35, 43, 59). SPEC permits either; we pick the one matching local style.
2. **Whether to name the function** → yes, both `materializeFreeformIssue` and `cycle drop`. SPEC says "`materializeFreeformIssue` (and/or `cycle drop`)"; naming both removes ambiguity for a future reader who only reads the note.
3. **Trailing inline comment on line 52** → preserved verbatim. SPEC says fields other than `priority:` value are untouched; the comment is part of the same line, not the value.
4. **Exact prose** → `Default and range: \`priority\` is an integer in the inclusive range 1–10; \`cycle drop\` (via \`materializeFreeformIssue\`) emits \`3\` when \`--priority\` is not given.` This packs all three required facts in one sentence under ~180 chars and uses backticks consistent with the rest of the RFC.

---

## Task 1: Edit the §"Raw drop" example and append the default-note line

### Overview
Single targeted edit to `docs/RFC-001-issue-lifecycle.md`. Two surgical changes inside one `Edit` tool call each:

1. Replace `priority: 5` with `priority: 3` on line 52, preserving the trailing comment whitespace + text exactly.
2. Insert one blank line + one prose line immediately after the closing fence on line 53, before the existing blank line that precedes `### Triaged todo`.

### Changes Required

**File**: `docs/RFC-001-issue-lifecycle.md`

**Change 1** — line 52, single-token swap. The `old_string` includes enough surrounding context (the `triage_attempts:` line above and the closing `---` below) to make it unique:

```
old_string:
triage_attempts: 0    # engine-managed
priority: 5           # optional hint to triage; not honored automatically
---

new_string:
triage_attempts: 0    # engine-managed
priority: 3           # optional hint to triage; not honored automatically
---
```

(Whitespace between `priority:` and `3` is the same column count as the original `5`, so the inline `#` comment column does not move.)

**Change 2** — insert one blank line + one prose line after the closing fence on line 53. Anchor on the closing fence + the next two lines (blank, then `### Triaged todo`) so the `old_string` is unique:

```
old_string:
```

### Triaged todo (`todo/<parent>-<slug>.md`)

new_string:
```

Default and range: `priority` is an integer in the inclusive range 1–10; `cycle drop` (via `materializeFreeformIssue`) emits `3` when `--priority` is not given.

### Triaged todo (`todo/<parent>-<slug>.md`)
```

(The opening triple-backtick in the `old_string` above is the closing fence of the §"Raw drop" example block — i.e. line 53 of the RFC. The `new_string` keeps that closing fence, then one blank line, the new prose line, one blank line, then the `### Triaged todo` heading.)

### Success Criteria
- [ ] `docs/RFC-001-issue-lifecycle.md:52` reads `priority: 3           # optional hint to triage; not honored automatically` (verify with `Grep -n "priority: 3" docs/RFC-001-issue-lifecycle.md`; should match line 52, plus the unrelated `:320` `priority_hint` is unaffected).
- [ ] `Grep -n "priority: 5" docs/RFC-001-issue-lifecycle.md` returns no results.
- [ ] The new prose line appears immediately after the §"Raw drop" closing fence and before `### Triaged todo`, names `1–10`, `3`, `cycle drop`, and `materializeFreeformIssue`.
- [ ] `git diff --stat` shows exactly one file changed: `docs/RFC-001-issue-lifecycle.md`.
- [ ] `git diff docs/RFC-001-issue-lifecycle.md` shows exactly: one `-priority: 5 …` / `+priority: 3 …` pair, plus the two added lines (the blank line + the prose line). No other hunks.
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm test` passes (all current tests; expected no-op).
- [ ] `npm run test:coverage` passes with line ≥ 95%, branch ≥ 75%, func ≥ 90% (expected no-op since no `src/` file was touched).

---

## Testing Strategy

### Unit Tests
- None added. The deliverable is a Markdown edit; there is no code path to cover. Adding a doc-content assertion test (e.g. grepping the RFC at runtime) would be premature scope and would invert the dependency between docs and code.
- The materializer/CLI default (`3`) and range (`1–10`) are already covered by tests added in cycles 0019 and 0042 (`tests/issue/materialize.test.ts` and the CLI parse-args tests). Those tests are the load-bearing guardrail; this RFC edit only brings the doc into agreement with what those tests already pin.

### Integration / E2E Tests
- None added. Existing `npm test` run is the sanity check that nothing else regressed.
- Manual verification: open `docs/RFC-001-issue-lifecycle.md` in the editor, scroll to §"Raw drop", confirm the example shows `priority: 3` and the new note line reads as intended directly under the closing fence.

### Mocking
- No mocks. Doc-only change; nothing to mock.

## Risk Assessment
- **Risk**: Edit accidentally touches a different `priority:` line in the RFC (e.g. the `priority_hint` at `:320` or the §"Triaged todo" example at `:57`–`:77`).
  **Mitigation**: Each `old_string` in Task 1 uses ≥ 2 lines of unique context (specifically the `triage_attempts:` line and the closing `---` for change 1; the closing fence plus `### Triaged todo` heading for change 2). After the edit, run `Grep -n "priority:" docs/RFC-001-issue-lifecycle.md` and confirm the `:52` line now shows `3` and no other `priority:` line in the file changed.
- **Risk**: Whitespace drift on line 52 (the comment column shifts because `5` was replaced with `3` of a different width — they're not, both single chars, but easy to mis-edit).
  **Mitigation**: The replacement preserves the exact whitespace block between `priority:` and the value; both `5` and `3` are single characters, so the `#` comment column does not move. Verify by visually diffing the line in `git diff`.
- **Risk**: `npm test` flakes on an unrelated cycle artifact (e.g. another in-flight migration). 
  **Mitigation**: This cycle changes no source. If `npm test` fails, the failure is unrelated to this edit; capture the failure verbatim, do not roll back the doc edit, and surface the unrelated failure as a reflection sharp-edge rather than a fix-step input for cycle 0044.
- **Risk**: Reflection step later surfaces "RFC has other example/default mismatches" as a new sharp edge.
  **Mitigation**: Acceptable and intentional. SPEC explicitly bounds this cycle to the §"Raw drop" mismatch; broader sweeps belong in their own cycle and will be surfaced via the reflection/triage path, not by widening 0044's scope here.
```
