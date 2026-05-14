# SPEC — Cycle 0044: Reconcile RFC-001 raw-drop example priority with materializer default

## Objective

Eliminate a doc/code disagreement in `docs/RFC-001-issue-lifecycle.md` §"Raw drop": the example frontmatter shows `priority: 5`, but `materializeFreeformIssue` (the canonical writer behind `cycle drop`) emits `priority: 3` as the default (legal range 1–10). Edit the example so a future contributor reading the RFC does not assume `5` is the default. Doc-only — no code or behavior change.

## Source Issue

`refl-0019-rfc-001-raw-drop-example-priority-mismat` — "Reconcile RFC-001 raw-drop example priority with materializer default (3)"

## Scope

### In Scope

- Edit the §"Raw drop" example block in `docs/RFC-001-issue-lifecycle.md` so the example's `priority:` value is `3` (Option (a) from the issue — recommended for clarity).
- Add a single one-line note immediately after the example block stating the legal range (1–10), the actual default (`3`), and pointing at the writer (`materializeFreeformIssue` / `cycle drop`).

### Out of Scope

- Any change to the materializer's default value or legal range.
- Adding a separate "RFC examples vs. defaults" section, glossary, or other structural reorganization.
- Stylistic sweeps of other RFC sections that do not have the same priority-default ambiguity.
- Changes to any code, tests, workflow YAML, prompts, or scripts.

## Requirements

- The §"Raw drop" example in `docs/RFC-001-issue-lifecycle.md` MUST show `priority: 3` (not `5`).
- A single inline note (one line, immediately after the fenced example block) MUST state:
  - the legal range is `1–10` inclusive,
  - the default emitted by `cycle drop` (when `--priority` is not given) is `3`,
  - the writer is `materializeFreeformIssue` (and/or the `cycle drop` CLI surface).
- The edit MUST be the smallest change that satisfies the above; surrounding paragraphs, headings, and example fields other than `priority:` are untouched.
- No other file in the repo is modified.

## Acceptance Criteria

- [ ] `docs/RFC-001-issue-lifecycle.md` §"Raw drop" example shows `priority: 3` and no longer suggests `5` is the default.
- [ ] A one-line note immediately follows the example block, explicitly naming the legal range (1–10) and the default (3), and referencing `materializeFreeformIssue` / `cycle drop`.
- [ ] No other code, test, workflow, prompt, or doc file is modified in this cycle (verified by `git diff --stat` showing exactly one file changed).
- [ ] `npm test` still passes (sanity — expected no-op since only an `.md` file changed).
- [ ] `npm run typecheck` still passes with no warnings (sanity — expected no-op).
- [ ] Coverage baselines unchanged (line ≥ 95%, branch ≥ 75%, func ≥ 90%) — no source files touched.

## Testing Strategy

- Doc-only change; no new tests required and none expected to break.
- Verification: run `npm test` and `npm run typecheck` as sanity gates. Both should pass without changes.
- Manual verification: read the rendered §"Raw drop" section and confirm the example value and the inline note match the materializer's documented behavior in `src/issue/materialize.ts` (or equivalent path).
- No UI change → no Playwright / browser test required.

## Documentation Updates

- **`docs/RFC-001-issue-lifecycle.md`**: the in-scope edit itself (this *is* the documentation update).
- **CLAUDE.md / AGENTS.md**: no change — neither documents the raw-drop priority default.
- **README.md**: no change — README does not currently surface the `priority:` default or range.

Documentation is part of "done"; since the deliverable is the doc edit, completing the in-scope edit satisfies this.

## Dependencies

- The `materializeFreeformIssue` writer already emits `priority: 3` as the default with a validated 1–10 range (landed in earlier cycles 0019 and 0042). No new code or behavior is required for this cycle to be valid.
- No external services, env vars, or new dependencies.
