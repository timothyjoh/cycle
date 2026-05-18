All implementation is already in place (completed in prior session). All gates pass.

Cycle 0158 implementation is complete — `cycle run --dry-run` and `cycle run "<text>" --dry-run` are now log-file-free, matching `cycle drop` behavior. Modified `src/cli.ts` (+27/-34 lines): relocated `if (args.dryRun)` short-circuit block above `createLogger` call and rewrote it using `console.log(JSON.stringify(...))` with explicit `ts:` field; removed the old dry-run block at the original location; cleaned up 5 dead `args.dryRun` branches left by the relocation. Modified `tests/cli/multi-loop.test.ts` (+22/-2 lines): switched `'run' lists pending rows in dry-run mode` to parse `r.stdout` instead of `log.jsonl`, replaced `findLast` with `expectExactlyOne` for cardinality pinning on `engine.stop`, and added ENOENT try/catch assertion; added matching ENOENT assertion to `'run "<text>" --dry-run' pins raw frontmatter` test. Modified `docs/ENGINE.md` (-1 line): minor doc update. Ran `npm run test:coverage` (Node 22.22.2): 504/504 pass, 0 fail. Coverage: 98.35% line / 91.34% branch / 92.83% function — all global floors met, all per-file floors met. `npm run typecheck` clean, no warnings. All PLAN.md tasks complete: Task 1 (cli.ts relocation + dead branch cleanup) and Task 2 (test updates — Change A stdout parsing + ENOENT, Change B ENOENT). No deviations from PLAN.md. No deferred work.

## Touched Files
- src/cli.ts
- tests/cli/multi-loop.test.ts
- docs/ENGINE.md
