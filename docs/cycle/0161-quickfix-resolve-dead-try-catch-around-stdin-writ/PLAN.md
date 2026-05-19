## Fix

- File: `src/engine/exec-codex.ts:39-44`
- Change: Delete the `try/catch` wrapper around `child.stdin.write(prompt)` and `child.stdin.end()`. Keep both calls as bare statements. The `child.stdin.on('error', () => {})` listener (line 38) already swallows EPIPE; the `child.on('error', ...)` handler (lines 30-37) owns the resolve on ENOENT. The catch block is unreachable.

Result after fix — lines 38-41 become:
```ts
child.stdin.on("error", () => {});
child.stdin.write(prompt);
child.stdin.end();
```

## Test

- File: `tests/engine/exec-codex.test.ts`
- Test name: existing `"codex: resolves StepResult{status:failed,exitCode:-1} when codex binary missing (spawn ENOENT)"` (line 61) — re-run it to confirm no unhandled exception escapes after the try/catch is removed. No new test needed; this test is the regression contract.
- Coverage check: per-file function coverage for `src/engine/exec-codex.ts` must reach ≥ 90% (previously dragged to 85.71% by the unreachable catch). Run `npm run test:coverage` and verify.
