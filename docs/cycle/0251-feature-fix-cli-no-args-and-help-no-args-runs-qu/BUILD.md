All floors pass. Aggregate: Line 98.71%, Branch 92.56%, Function 93.36% — all above the required minimums (≥95%, ≥75%, ≥90%). No regressions.

## Summary

Modified `src/cli/parse-args.ts` (2 lines changed): narrowed the throw guard from `argv[0] !== "run"` to `argv.length > 0 && argv[0] !== "run"` so empty argv falls through to the run branch; added `help: { type: "boolean", default: false }` to the `nodeParseArgs` options map so `--help` no longer throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`. Modified `src/cli.ts` (22 lines added): inserted a help intercept block before the `parseArgs` call site that catches `argv[0] === "help"`, `argv[0] === "--help"`, and `argv.includes("--help")`, prints the structured usage block, and calls `process.exit(0)`. Added 3 unit test cases to `tests/cli/parse-args.test.ts` (14 lines) covering `parseArgs([])` (deepEqual to default RunArgs), `parseArgs(["run", "--help"])` (doesNotThrow), and `parseArgs(["--help"])` (throws, documents upstream-interception design). Created `tests/cli/help.test.ts` (88 lines) with 5 integration tests that spawn `dist/cycle.js` via `spawnSync`; MINIMAL_WORKFLOW includes the required `triage:` section; no-args test uses 30s timeout to handle concurrent suite load. All four PLAN.md tasks complete. Ran `npm test`: 721 tests pass, 0 fail. Ran `npm run test:coverage`: Line 98.71%, Branch 92.56%, Function 93.36% — all aggregate floors met, all per-file floors met, no regressions vs baseline.

## Touched Files
- src/cli/parse-args.ts
- src/cli.ts
- tests/cli/parse-args.test.ts
- tests/cli/help.test.ts
- CLAUDE.md
- README.md
