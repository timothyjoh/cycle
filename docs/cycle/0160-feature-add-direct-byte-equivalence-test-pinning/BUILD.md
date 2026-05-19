All gates pass. Cycle 0160 is already implemented and verified. BUILD.md is accurate.

**What's in the working tree:** `tests/cli/multi-loop.test.ts` has the new byte-equivalence test appended (+40 lines), and the issue file was moved from `todo/` to `done/`. 505/505 tests pass. Line 98.41% / Branch 91.43% / Function 92.83% — all above baseline. All per-file floors met. Typecheck clean.

All tasks complete. Modified `tests/cli/multi-loop.test.ts`: appended one new test (`'drop' and 'run "<text>"' produce byte-equal frontmatter after normalizing id and added_at`, +40 lines) that runs both CLI commands in isolated `mkdtemp` roots, normalizes `id:` and `added_at:` lines, and asserts byte equality via `assert.strictEqual` with a diff-friendly failure message. No production code changes. `npm test`: 505/505 pass. `npm run test:coverage`: Line 98.41%, Branch 91.43%, Function 92.83% — no regression. All per-file coverage floors met. `npm run typecheck`: clean. No deviations from PLAN.md. `--priority` omitted from both invocations per plan resolution — `run` has no `--priority` option; both default to priority 3.

## Touched Files
- tests/cli/multi-loop.test.ts
