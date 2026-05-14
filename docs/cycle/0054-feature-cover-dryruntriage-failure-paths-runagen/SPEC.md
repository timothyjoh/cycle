Cycle 0054. Issue clear. Write SPEC.

```markdown
# SPEC — Cycle 0054: Cover dryRunTriage failure paths (runAgent throws + missing prompt template)

## Objective
Pin the two `dryRunTriage` failure paths in `src/engine/triage.ts` that today are reached only by shared coverage through `runTriage`: (1) `runAgent` throwing mid-attempt, and (2) the prompt template file being absent on disk. Both are the canonical failure modes for an operator iterating on the triage prompt after `engine.paused {reason: "all_triage_failed"}`. We add two `dryRunTriage`-entry-point tests that pin observable behavior, make a tiny localized change in `triage.ts` for case B so its shape is intentional rather than incidental, and leave a one-line code comment marking that intent.

## Source Issue
`refl-0023-dry-run-untested-paths-runagent-throws-a` — "Cover dryRunTriage failure paths: runAgent throws + missing prompt template"

## Scope

### In Scope
- New test file additions in `tests/engine/triage-dry-run.test.ts` covering Case A (`runAgent` throws) and Case B (prompt template missing), each entering through `dryRunTriage` with no `runTriage` path used.
- Minimal `triage.ts` change to wrap the dry-run prompt-template `readFile` in a localized `try/catch` that re-throws a clear `Error` of the form `prompt template missing: <resolved-path>: <cause>`, plus a one-line comment marking the chosen Case B shape (top-level throw) as intentional per CLAUDE.md `triage --dry-run` contract.

### Out of Scope
- Any change to `runTriage` behavior for these same two failure modes (non-goal in source issue).
- Per-raw retry policy changes (non-goal).
- New public exported error classes (non-goal — we use a plain `Error` with stable message prefix; the test pins on `last_error` / `error.message`, not on a class).
- CLI-layer changes in `src/cli.ts` (top-level throw already maps to non-zero exit through the existing CLI error handler; no new mapping required).

## Requirements
- `dryRunTriage`'s `runAgent`-throws path returns a `DryRunReport` row with `status: "failed"`, `attempts: 3` (matches `MAX_ATTEMPTS` constant in `triage.ts`, same shape as `runTriage`), and `last_error` matching `/^agent failed: /` and containing the inner exception message substring.
- `dryRunTriage`'s missing-prompt-template path throws synchronously before any agent is invoked, with the resolved absolute path in `error.message` (prefix `prompt template missing: `).
- Neither failure mode writes anything under `docs/cycle/issues/` (no new files in `todo/`, no moves out of `raw/`), nor appends to `.cycle/tbd.jsonl`, nor writes to `.cycle/log.jsonl`. (`dryRunTriage` already does not take a `Logger` argument, but the test asserts the file is absent / unchanged to lock the dry-run contract.)
- Existing `triage-dry-run.test.ts` happy-path / shared-internal cases continue to pass unchanged.
- No change to `runTriage` shape or behavior; whole-suite green.

## Acceptance Criteria
- [ ] New Case A test (`runAgent` throws) fails on master and passes after the change. Assertions: exactly one row in the report; `raw_id` matches the seeded raw; `status === "failed"`; `attempts === 3`; `last_error` matches `/^agent failed: /` AND includes the substring `boom: claude spawn failed`.
- [ ] New Case A test asserts that after `dryRunTriage` resolves: `docs/cycle/issues/raw/` still contains the seeded raw file (no move); `docs/cycle/issues/todo/` is absent or empty; `.cycle/tbd.jsonl` is absent or unchanged (compare bytes if seeded empty); `.cycle/log.jsonl` is absent.
- [ ] New Case B test fails on master (if the unwrapped ENOENT message is the assertion) or after the wrap (asserts the new prefix) — whichever phrasing we settle, the test fails on master before the wrap is in place. Assertions: `await assert.rejects(dryRunTriage(...), (e) => /^prompt template missing: /.test(e.message) && e.message.includes(resolvedPromptPath))`.
- [ ] New Case B test asserts no filesystem mutations under `docs/cycle/issues/` and no writes to `.cycle/tbd.jsonl` or `.cycle/log.jsonl`.
- [ ] Coverage report shows the two previously-uncovered lines in `src/engine/triage.ts` — the `runAgent` `catch` block (currently `triage.ts:115-119`) and the prompt-template read site (currently `triage.ts:263-266`) — are now exercised by tests that enter through `dryRunTriage` (verifiable by temporarily commenting out `runTriage` tests; not part of the cycle).
- [ ] One-line comment placed adjacent to the wrapped `readFile` in `dryRunTriage` stating the Case B shape (top-level throw with `prompt template missing: <path>`) is intentional per the dry-run contract.
- [ ] `npm test` clean (full suite).
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` clean — per-file floor `src/engine/triage.ts ≥ 95%` holds; aggregate floors (line ≥ 95%, branch ≥ 75%, func ≥ 90%) do not regress.

## Testing Strategy
- **Framework**: Node's built-in `node:test` + `node:assert/strict`, matching every other file under `tests/engine/` and the existing `tests/engine/triage-dry-run.test.ts` setup.
- **Test harness**: tmp-repo pattern — `mkdtemp` a directory, scaffold `docs/cycle/issues/raw/`, `.cycle/`, write a representative raw file with valid frontmatter (`id`, `title`, `workflow: feature`, `depends_on: []`, `triaged_at: …`, `source: reflection`), copy the production prompt template `src/defaults/prompts/triage.md` to `.cycle/<cfg.triage.prompt>` for Case A only; omit the file entirely for Case B.
- **Dependency injection**: pass `{ runAgent }` to `dryRunTriage` so neither test ever spawns a real subprocess. Case A's `runAgent` is `async () => { throw new Error("boom: claude spawn failed"); }`. Case B does not need a stub — the throw fires before `runAgent` is reached, but pass a sentinel `runAgent` that throws `"should never be called"` so a regression that bypasses the template check would fail loudly.
- **CycleConfig fixture**: minimal object satisfying `CycleConfig` shape — only the fields touched by `dryRunTriage` (`triage.prompt`, `triage.agent`, plus whatever `processRawWithRetry` / `validateOutput` peek at). Reuse the existing fixture helper in the test file if present.
- **Negative assertions on the dry-run contract**: after the call resolves (Case A) or rejects (Case B), `readdir` `docs/cycle/issues/raw/` and confirm the seeded `.md` is still present; `stat` `docs/cycle/issues/todo/<id>.md` and assert `ENOENT`; `stat` `.cycle/log.jsonl` and assert `ENOENT`; for `.cycle/tbd.jsonl`, either assert `ENOENT` or, if seeded empty, byte-equal compare to the seeded contents.
- **No new E2E** — these are unit-level scenarios on a single function with a clear seam; the existing dry-run integration test in `tests/cli/` continues to cover the CLI plumbing.

## Documentation Updates
- **CLAUDE.md**: extend the existing `cycle triage --dry-run` row in the Commands table with one clause noting that "missing prompt template throws synchronously before any agent invocation; an agent that crashes mid-call surfaces as `status: failed, last_error: 'agent failed: …'` in the report after the configured retry budget is exhausted." This makes both observable shapes part of the documented contract, not implementation details.
- **README.md**: no user-facing surface change; skip.
- **In-code comment** (already counted as acceptance criteria): one line next to the `readFile` wrap in `dryRunTriage` marking the chosen shape.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing test scaffolding in `tests/engine/triage-dry-run.test.ts` (tmp-repo helpers, fixture builders).
- Production prompt template at `src/defaults/prompts/triage.md` (copied into the tmp `.cycle/` for Case A; absent for Case B).
- `CycleConfig` / `TriageConfig` types from `src/engine/workflow.ts`.
- No external services, no env vars, no Node version change.
```
