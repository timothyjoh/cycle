```markdown
# SPEC — Cycle 0009: Auto-Closes Linkage in commit.sh / pr.sh

## Objective

When a cycle's source issue body references one or more GitHub issue URLs, the cycle's commit message body and PR body must include `Closes #N` lines so GitHub auto-closes those issues on merge. Today these references go in by hand or not at all, leaving stale "open" issues even after their fix has shipped.

## Source Issue

`txt-20260513-011632-commit-sh-pr-sh-include-closes-n-linkage` — "commit.sh / pr.sh: include 'Closes #N' linkage when the cycle's issue body references a GitHub issue URL"

## Scope

### In Scope

- Add a parser (shell helper, used by both `commit.sh` and `pr.sh` in `src/defaults/scripts/`) that extracts every `https://github.com/<owner>/<repo>/issues/<N>` URL from the cycle's issue body file (`docs/cycle/issues/triaged/<issue_id>.md` or wherever the current issue is staged) and emits the deduped `N` numbers.
- `commit.sh` appends a blank line followed by one `Closes #<N>` per match to the commit message **body** (never the subject), in the order the URLs appear.
- `pr.sh` appends the same `Closes #<N>` block to the PR body it passes to `gh pr create`.

### Out of Scope

- Cross-repo references (`owner/repo#N` syntax, or URLs whose `<owner>/<repo>` does not match the current repo).
- Other GitHub keywords (`Fixes`, `Resolves`) — emit `Closes` only.
- PR-URL references (`/pull/<N>`); only `/issues/<N>` URLs trigger the linkage.
- Editing already-merged PRs / commits.
- Re-running on past cycles.

## Requirements

- Parser tolerates trailing punctuation, query strings, and fragments on the URL (`…/issues/42)`, `…/issues/42?foo=1`, `…/issues/42#comment`).
- Parser deduplicates `<N>`: each issue referenced twice in the body produces a single `Closes #N` line.
- `<owner>/<repo>` from the URL must equal the current repo's `gh repo view --json nameWithOwner -q .nameWithOwner` value; mismatches are silently skipped (out-of-scope cross-repo).
- When no qualifying URLs are present, commit message and PR body are emitted unchanged — no trailing blank line, no empty `Closes` block.
- `Closes #N` lines live in the commit message body separated from the subject by a single blank line; PR body keeps existing template/content and appends the block at the end after a blank line.
- Locating the current issue file: scripts read `cycle_id` and `issue_id` from the latest `cycle.start` event in `.cycle/log.jsonl`, then look up the issue body at `docs/cycle/issues/triaged/<issue_id>.md` (fall back to `queued/`).

## Acceptance Criteria

- [ ] New test: cycle whose issue body contains `https://github.com/<owner>/<repo>/issues/99` produces a commit body line `Closes #99` and a PR body ending with `Closes #99`.
- [ ] New test: multiple URLs (`#7`, `#9`, `#7` again) produce exactly two `Closes` lines in order `Closes #7` then `Closes #9`.
- [ ] New test: URL with trailing `)` / `?ref=x` / `#anchor` still parses cleanly to its bare `<N>`.
- [ ] New test: URL pointing at a different `<owner>/<repo>` is skipped — no `Closes` line emitted.
- [ ] New test: issue body with zero GitHub issue URLs produces commit + PR body byte-identical to the pre-change behavior.
- [ ] `Closes #N` lines never appear on the commit subject line.
- [ ] `src/defaults/scripts/commit.sh` and `src/defaults/scripts/pr.sh` byte-match what `cycle init` would deploy (synced with `dist/` / engine bundle).
- [ ] All existing tests in `tests/defaults/` still pass.
- [ ] No new shellcheck / typecheck warnings.

## Testing Strategy

- Framework: existing Node test runner used by `tests/defaults/scripts.test.ts`; new file `tests/defaults/closes-linkage.test.ts` (or co-located in `scripts.test.ts` if it stays under ~200 lines).
- Use the existing test-repo harness — initialize a temp git repo with a `.cycle/log.jsonl` `cycle.start` line and a synthetic `docs/cycle/issues/triaged/<id>.md`, then invoke the scripts and assert on captured commit message + PR body (mock `gh pr create` via `PATH` shim that records argv).
- Cover: happy path single URL, multi-URL dedup, trailing punctuation, cross-repo skip, empty-match regression.

## Documentation Updates

- **CLAUDE.md / AGENTS.md** (repo root, if present): one-line note under script behavior — "commit.sh and pr.sh append `Closes #N` lines parsed from the cycle's issue body".
- **README.md**: add a single bullet under the cycle behavior list noting auto-linkage of `Closes #N` from issue body URLs.
- **DOGFOOD.md**: mark this sharp-edge resolved.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `gh` CLI authenticated (already a baseline requirement; used to resolve current `<owner>/<repo>`).
- `.cycle/log.jsonl` populated with a `cycle.start` record (always true by the time `commit` / `pr` steps run).
- Issue files reachable on disk under `docs/cycle/issues/{triaged,queued}/<issue_id>.md`.
```
