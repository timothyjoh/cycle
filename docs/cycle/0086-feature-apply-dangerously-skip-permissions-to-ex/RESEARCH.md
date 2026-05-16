Write requires approval — waiting for permission to land the file.

The key finding: **the `--dangerously-skip-permissions` assertion from cycle 0085 is NOT present in `tests/engine/exec-claudecode.test.ts`**. The test only asserts `/SPECCED/` at line 22. The SPEC's assumption that 0085 landed it is wrong. The plan must include both tasks:

1. `src/engine/exec-claudecode.ts:13` — insert `"--dangerously-skip-permissions"` before `"-p"`
2. `tests/engine/exec-claudecode.test.ts:22` — add `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the existing `/SPECCED/` assertion
