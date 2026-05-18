I have all context needed. Writing the spec now.

```markdown
# SPEC — Cycle 0158: Move `--dry-run` Short-Circuit Before Logger Creation

## Objective
`cycle run "<text>" --dry-run` currently creates `.cycle/log.jsonl` in the consumer repo because `createLogger` and `engine.start` emission happen before the dry-run early-exit. `cycle drop` exits before `createLogger` and writes no log file. This cycle eliminates the asymmetry by moving the dry-run short-circuit above `createLogger`, then updating the existing test that was forced to avoid a log-absence assertion.

## Source Issue
`refl-0043-cycle-run-dry-run-emits-log-jsonl-while` — "Make `cycle run \"<text>\" --dry-run` log-file-free to match `cycle drop` (or document the asymmetry)"

## Scope

### In Scope
- Move the `args.dryRun` short-circuit in `src/cli.ts` (currently lines 385–397) to before `createLogger(cwd)` (currently line 91), re-emitting dry-run output via `console.log(JSON.stringify(...))` directly
- Update `tests/cli/multi-loop.test.ts` test `'run' lists pending rows in dry-run mode` to parse stdout instead of `log.jsonl`, and add an explicit `log.jsonl` absence assertion
- Add a second e2e test asserting `cycle run "<text>" --dry-run` writes no `.cycle/log.jsonl`

### Out of Scope
- Option B (documentation path) — investigation confirms nothing depends on the dry-run-emitted `engine.start` (no test reads `log.jsonl` for audit/resume after dry-run)
- Any other CLI surface changes
- Changes to `cycle drop` behavior (already correct)

## Requirements
- After the fix, `cycle run "<text>" --dry-run` must not create `.cycle/log.jsonl` in the consumer repo
- The dry-run stdout output (`issue.ingested` × N, `engine.stop`) must remain structurally identical — same event names and fields; only delivery mechanism changes (stdout-only, no file append)
- `materializeFreeformIssue(args.text, cwd)` must still execute before the dry-run exit so the issue is dropped into `raw/` (this is the visible side-effect of `run "<text>"`)
- No regression in the non-dry-run path

## Acceptance Criteria
- [ ] `cycle run "<text>" --dry-run` in a fresh temp dir does not create `.cycle/log.jsonl`
- [ ] `cycle run --dry-run` (no text) in a seeded queue still prints correct `issue.ingested` and `engine.stop` events on stdout
- [ ] Existing test `'run' lists pending rows in dry-run mode` parses stdout (not `log.jsonl`) and asserts `log.jsonl` is absent
- [ ] New e2e test asserts `cycle run "<text>" --dry-run` produces no `log.jsonl` (mirrors the equivalent drop assertion at `multi-loop.test.ts:141–145`)
- [ ] All existing tests still pass (`npm test`)
- [ ] `npm run typecheck` passes with no warnings
- [ ] Coverage floors hold (`npm run check:coverage`)

## Testing Strategy
- Node built-in test runner (`node:test`), same as existing `tests/cli/multi-loop.test.ts`
- Fix existing test: swap `readFile(logPath)` for parsing `r.stdout.trim().split("\n").map(JSON.parse)` and add `assert.equal(fs.existsSync(logPath), false)`
- New test: seed a temp dir with `args.text` scenario, run `node dist/cycle.js run "some task" --dry-run`, assert `log.jsonl` absent (ENOENT)
- No UI changes; no E2E browser tests required

## Documentation Updates
- **CLAUDE.md**: No change needed — the asymmetry is being removed, not documented
- **README.md**: No user-facing behavior change (dry-run stdout output unchanged)

## Dependencies
- `dist/cycle.js` must be built before tests run (`npm test` handles this via `pretest`)
- No new external dependencies
```
